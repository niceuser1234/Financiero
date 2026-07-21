"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Source = { tool: string; args: Record<string, unknown>; summary: string };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[] };

const SUGGESTIONS = [
  "Wie viel gebe ich für Lebensmittel aus?",
  "Was kostet Essen gehen im letzten Monat?",
  "Welche Abos laufen gerade?",
  "Wie viel bleibt mir für die nächsten 10 Tage?",
  "Wo kann ich am ehesten sparen?",
];

function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;

  return (
    <div className="mt-2 border-t border-hairline/60 pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 text-[11px] font-medium text-ink-400 hover:text-ink-700"
      >
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
        Basis · {sources.length} {sources.length === 1 ? "Quelle" : "Quellen"}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {sources.map((source, index) => (
            <li key={`${source.tool}-${index}`} className="text-[11.5px] leading-snug text-ink-500">
              <span className="font-medium text-ink-700">{source.tool}</span> — {source.summary}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type StreamEvent =
  | { type: "sources"; sources: Source[] }
  | { type: "delta"; text: string }
  | { type: "done" };

function parseEvents(buffer: string, onEvent: (event: StreamEvent) => void): string {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    try {
      onEvent(JSON.parse(trimmed.slice(5).trim()) as StreamEvent);
    } catch {
      // Incomplete or keep-alive lines are ignored.
    }
  }
  return remainder;
}

export function FinanceChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    setError(null);
    const history: Msg[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "", sources: [] }]);
    setInput("");
    setBusy(true);

    const patchLast = (patch: (message: Msg) => Msg) =>
      setMessages((current) => current.map((message, index) => (index === current.length - 1 ? patch(message) : message)));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content: message }) => ({ role, content: message })) }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}) as { error?: string });
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = parseEvents(buffer, (event) => {
          if (event.type === "sources") patchLast((message) => ({ ...message, sources: event.sources }));
          if (event.type === "delta") patchLast((message) => ({ ...message, content: message.content + event.text }));
        });
      }

      if (buffer.trim()) {
        parseEvents(`${buffer}\n`, (event) => {
          if (event.type === "sources") patchLast((message) => ({ ...message, sources: event.sources }));
          if (event.type === "delta") patchLast((message) => ({ ...message, content: message.content + event.text }));
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Anfrage konnte nicht verarbeitet werden.");
      setMessages((current) => current.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] w-full max-w-2xl flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {empty && (
          <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-[var(--accent)]">
              <Sparkles className="size-6" strokeWidth={1.75} />
            </span>
            <div>
              <div className="text-base font-semibold text-ink-900">Konto-Chat</div>
              <p className="mt-1 text-sm text-ink-500">
                Frag nach Ausgaben, Abos und Sparspielraum. Die Antworten basieren auf deinen echten Buchungen.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-xl border border-hairline bg-surface px-4 py-2.5 text-left text-sm text-ink-700 transition-colors hover:border-[var(--accent)] hover:text-ink-900"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            {message.role === "assistant" && (
              <span className="mr-2 mt-0.5 grid size-7 shrink-0 place-items-center self-start rounded-lg bg-accent-soft text-[var(--accent)]">
                <Sparkles className="size-3.5" strokeWidth={2} />
              </span>
            )}
            <div
              className={cn(
                "max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                message.role === "user"
                  ? "rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-bl-md bg-surface text-ink-900 ring-1 ring-hairline",
              )}
            >
              {message.content || (busy && index === messages.length - 1 ? <Loader2 className="size-4 animate-spin text-ink-400" /> : null)}
              {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                <Sources sources={message.sources} />
              )}
            </div>
          </div>
        ))}

        {error && <p className="rounded-xl bg-expense-soft px-4 py-2.5 text-sm text-expense-strong">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="sticky bottom-0 flex items-end gap-2 border-t border-hairline bg-background/95 py-3 backdrop-blur"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={1}
          placeholder="Frag nach deinen Ausgaben, Abos, Sparspielraum…"
          className="max-h-32 min-h-[46px] flex-1 resize-none rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 rounded-2xl"
          disabled={busy || !input.trim()}
          aria-label="Senden"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
