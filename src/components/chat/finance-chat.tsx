"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Wie viel gebe ich durchschnittlich für Lebensmittel aus?",
  "Was kostet Restaurant/Essen gehen im letzten Monat?",
  "Welche Abos und Verträge laufen gerade?",
  "Wie viel Geld bleibt mir realistisch für die nächsten 10 Tage?",
  "Wo kann ich am ehesten sparen?",
];

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
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as { message?: Msg; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.message) setMessages((m) => [...m, data.message!]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[min(70dvh,720px)] flex-col rounded-lg border border-hairline bg-surface">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <span className="grid size-8 place-items-center rounded-md bg-accent-soft text-[var(--accent)]">
          <Sparkles className="size-4" strokeWidth={2} />
        </span>
        <div>
          <div className="text-sm font-semibold text-ink-900">Konto-Chat</div>
          <div className="text-xs text-ink-400">Frag nach Ausgaben, Abos und Sparspielraum</div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-ink-500">
              Stell eine Frage zu deinen echten Kontodaten. Beispiele:
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-hairline bg-background px-3 py-1.5 text-left text-xs text-ink-700 transition-colors hover:border-[var(--accent)] hover:text-ink-900"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[90%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-background text-ink-900 ring-1 ring-hairline",
            )}
          >
            {m.content}
          </div>
        ))}

        {busy && (
          <div className="inline-flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs text-ink-400 ring-1 ring-hairline">
            <Loader2 className="size-3.5 animate-spin" />
            Rechne mit deinen Buchungen…
          </div>
        )}
        {error && (
          <p className="rounded-md bg-expense-soft px-3 py-2 text-sm text-expense-strong">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-hairline p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={1}
          placeholder="z.B. Wie viel für Restaurants im Juni?"
          className="max-h-28 min-h-[42px] flex-1 resize-none rounded-md border border-hairline bg-background px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Senden">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
