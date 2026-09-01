import { NextResponse } from "next/server";
import { z } from "zod";
import {
  estimateAvailable,
  listActiveRecurring,
  listBalances,
  querySpending,
  snapshotForPrompt,
} from "@/lib/chat/queries";
import { CHAT_SYSTEM } from "@/lib/chat/system";
import { isLlmEnabled, llmBaseUrl } from "@/lib/local-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
});

const tools = [
  {
    type: "function" as const,
    function: {
      name: "query_spending",
      description:
        "Summiert Ausgaben nach Kategorie oder Händler in einem Zeitraum (ISO-Datum YYYY-MM-DD). Negativ = Ausgabe.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          from: { type: "string", description: "Start YYYY-MM-DD" },
          to: { type: "string", description: "Ende YYYY-MM-DD" },
          groupBy: { type: "string", enum: ["category", "merchant"] },
          filter: { type: "string", description: "Optionaler Filter auf Name/Slug (z.B. restaurant, rewe)" },
        },
        required: ["from", "to", "groupBy"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_recurring",
      description: "Listet erkannte aktive Abos, Verträge und wiederkehrende Einnahmen.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_balances",
      description: "Aktueller Kontosaldo je Konto und Gesamtsaldo.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "estimate_available",
      description:
        "Schätzt, wie viel Geld realistisch für die nächsten N Tage verfügbar ist (Saldo minus Verträge minus variable Ausgaben).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          days: { type: "integer", minimum: 1, maximum: 90 },
        },
        required: ["days"],
      },
    },
  },
];

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "query_spending":
      return querySpending({
        from: String(args.from),
        to: String(args.to),
        groupBy: args.groupBy === "merchant" ? "merchant" : "category",
        filter: args.filter ? String(args.filter) : undefined,
      });
    case "list_recurring":
      return listActiveRecurring();
    case "list_balances":
      return listBalances();
    case "estimate_available":
      return estimateAvailable(Number(args.days ?? 14));
    default:
      return { error: `Unknown tool ${name}` };
  }
}

type ToolSource = {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
};

function summarizeToolResult(name: string, args: Record<string, unknown>, result: unknown): string {
  if (name === "query_spending" && Array.isArray(result)) {
    const top = (result as { label: string; amountFmt: string }[])
      .slice(0, 3)
      .map((row) => `${row.label} ${row.amountFmt}`)
      .join(", ");
    return `${args.from}–${args.to}${args.filter ? ` · ${args.filter}` : ""}: ${top || "keine Treffer"}`;
  }
  if (name === "estimate_available" && result && typeof result === "object") {
    const estimate = result as { days?: number; availableFmt?: string };
    return `verfügbar in ${estimate.days} Tagen: ${estimate.availableFmt}`;
  }
  if (name === "list_recurring" && Array.isArray(result)) {
    return `${result.length} aktive Verträge/Abos`;
  }
  if (name === "list_balances") return "Kontosalden";
  return name;
}

export async function POST(req: Request) {
  if (!isLlmEnabled()) {
    return NextResponse.json(
      { error: "LLM ist im lokalen Sicherheitsmodus deaktiviert" },
      { status: 503 },
    );
  }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY fehlt" }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const model = process.env.CHAT_MODEL ?? process.env.CLASSIFY_MODEL ?? "google/gemini-2.5-flash";
  let base: string;
  try {
    base = llmBaseUrl();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  const snapshot = await snapshotForPrompt();
  const system = `${CHAT_SYSTEM}\n\nAktueller Daten-Snapshot (als Ausgangspunkt, Tools für Details nutzen):\n${JSON.stringify(snapshot, null, 0).slice(0, 12000)}`;

  type Msg =
    | { role: "system" | "user" | "assistant"; content: string }
    | {
        role: "assistant";
        content: string | null;
        tool_calls: { id: string; type: "function"; function: { name: string; arguments: string } }[];
      }
    | { role: "tool"; tool_call_id: string; content: string };

  const messages: Msg[] = [
    { role: "system", content: system },
    ...parsed.data.messages.map((m) => ({ role: m.role, content: m.content }) as Msg),
  ];

  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${key}`,
  };
  const sources: ToolSource[] = [];

  // Bis zu 4 Tool-Runden
  for (let round = 0; round < 4; round++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `OpenRouter ${res.status}: ${text}` }, { status: 502 });
    }
    const data = (await res.json()) as {
      choices: {
        message: {
          role: string;
          content: string | null;
          tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
        };
        finish_reason?: string;
      }[];
    };
    const msg = data.choices[0]?.message;
    if (!msg) return NextResponse.json({ error: "Leere Antwort" }, { status: 502 });

    if (msg.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: msg.content,
        tool_calls: msg.tool_calls,
      });
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = await runTool(tc.function.name, args);
        sources.push({
          tool: tc.function.name,
          args,
          summary: summarizeToolResult(tc.function.name, args, result),
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 14000),
        });
      }
      continue;
    }

    break;
  }

  // Der abschließende Assistenten-Turn wird gestreamt, damit die Antwort direkt sichtbar wird.
  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.3, stream: true }),
  });
  const upstreamBody = upstream.body;
  if (!upstream.ok || !upstreamBody) {
    const text = await upstream.text().catch(() => "");
    return NextResponse.json({ error: `OpenRouter ${upstream.status}: ${text}` }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({ type: "sources", sources });
      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawText = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;

            try {
              const chunk = JSON.parse(payload) as {
                choices?: { delta?: { content?: string | null } }[];
              };
              const text = chunk.choices?.[0]?.delta?.content;
              if (text) {
                sawText = true;
                send({ type: "delta", text });
              }
            } catch {
              // Keep-alive or incomplete upstream lines are ignored.
            }
          }
        }
      } catch {
        send({ type: "delta", text: "Die Antwort konnte nicht vollständig geladen werden." });
      }

      if (!sawText) {
        send({ type: "delta", text: "Ich konnte dazu keine Antwort bilden. Bitte formuliere die Frage etwas konkreter." });
      }
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
