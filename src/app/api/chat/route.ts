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

export async function POST(req: Request) {
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
  const base = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

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
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 14000),
        });
      }
      continue;
    }

    return NextResponse.json({
      message: { role: "assistant" as const, content: msg.content ?? "" },
    });
  }

  return NextResponse.json({
    message: {
      role: "assistant" as const,
      content: "Ich habe zu viele Datenabfragen gebraucht. Bitte formuliere die Frage etwas enger.",
    },
  });
}
