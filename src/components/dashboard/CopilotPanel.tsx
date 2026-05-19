import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Send, X, Loader2, Wrench } from "lucide-react";
import { copilotChat } from "@/lib/copilot.functions";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: Array<{ name: string; summary: string }>;
}

const SUGGESTIONS = [
  "Top 5 high-confidence leads this week",
  "VA hospitals in Texas with ultrasound recall signals",
  "Find POCUS directors in Oklahoma",
  "Draft a switch-pitch for the highest-confidence Mindray lead",
];

export function CopilotPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useServerFn(copilotChat);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = async (text: string) => {
    if (!text.trim() || busy) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "", tools: [] }]);
    setInput("");
    setBusy(true);

    try {
      const stream = await send({
        data: { messages: history.map((m) => ({ role: m.role, content: m.content })) },
      });
      for await (const event of stream as AsyncIterable<
        | { type: "text"; text: string }
        | { type: "tool_start"; name: string; args: Record<string, unknown> }
        | { type: "tool_end"; name: string; summary: string }
        | { type: "error"; message: string }
      >) {
        if (event.type === "text") {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") last.content += event.text;
            return next;
          });
        } else if (event.type === "tool_start") {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              last.tools = [...(last.tools ?? []), { name: event.name, summary: "running…" }];
            }
            return next;
          });
        } else if (event.type === "tool_end") {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant" && last.tools?.length) {
              const idx = last.tools.length - 1;
              last.tools[idx] = { name: event.name, summary: event.summary };
            }
            return next;
          });
        } else if (event.type === "error") {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") last.content = `⚠️ ${event.message}`;
            return next;
          });
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          last.content = `⚠️ ${e instanceof Error ? e.message : "Copilot failed"}`;
        }
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative flex h-full w-full max-w-[480px] flex-col border-l border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-display font-semibold">Copilot</span>
          <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Beta
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-surface-2 p-4 text-sm">
                <div className="mb-2 font-semibold">Ask the Yield Architect Copilot</div>
                <p className="text-xs text-muted-foreground">
                  I can search leads, accounts, and physicians, fetch account briefs, and draft
                  outreach emails. Ground every answer in live data.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Try
                </div>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="block w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-left text-xs text-foreground/90 transition-colors hover:border-primary/40 hover:bg-surface-3"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "max-w-[95%] space-y-2"
                    }
                  >
                    {m.tools && m.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.tools.map((t, j) => (
                          <span
                            key={j}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <Wrench className="h-2.5 w-2.5" />
                            <span className="font-mono">{t.name}</span>
                            <span>· {t.summary}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {m.role === "assistant" && m.content ? (
                      <div className="prose prose-invert prose-sm max-w-none rounded-md border border-border bg-surface-2 px-3 py-2 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : m.role === "user" ? (
                      m.content
                    ) : (
                      busy &&
                      i === messages.length - 1 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          className="flex items-center gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Ask about leads, accounts, physicians…"
            className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
