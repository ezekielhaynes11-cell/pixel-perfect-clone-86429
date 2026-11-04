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
        // All branches rebuild the last message immutably (never mutate objects
        // held in a previous state) so StrictMode's double-invoked updaters and
        // React's referential-equality checks behave correctly.
        if (event.type === "text") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role !== "assistant") return prev;
            return [...prev.slice(0, -1), { ...last, content: last.content + event.text }];
          });
        } else if (event.type === "tool_start") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role !== "assistant") return prev;
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                tools: [...(last.tools ?? []), { name: event.name, summary: "running…" }],
              },
            ];
          });
        } else if (event.type === "tool_end") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role !== "assistant" || !last.tools?.length) return prev;
            const tools = last.tools.map((t, i) =>
              i === last.tools!.length - 1 ? { name: event.name, summary: event.summary } : t,
            );
            return [...prev.slice(0, -1), { ...last, tools }];
          });
        } else if (event.type === "error") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role !== "assistant") return prev;
            return [...prev.slice(0, -1), { ...last, content: `⚠️ ${event.message}` }];
          });
        }
      }
    } catch (e) {
      // Log the real error; show the user a safe, friendly fallback.
      console.error("[copilot] request failed:", e);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role !== "assistant") return prev;
        return [
          ...prev.slice(0, -1),
          { ...last, content: "⚠️ Something went wrong reaching the Copilot. Please try again." },
        ];
      });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />
      <div
        className="relative flex h-full w-full max-w-[500px] flex-col border-l border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-16 items-center gap-2.5 border-b border-border/50 px-5">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-display font-semibold text-foreground">Copilot</span>
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
            Direct Cloud API
          </span>
          <button
            onClick={onClose}
            aria-label="Close Copilot"
            className="ml-auto flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-border/40 bg-surface/50 p-4 text-sm backdrop-blur-sm">
                <div className="mb-1.5 font-semibold text-foreground">
                  Yield Architect Intelligence Copilot
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Grounded directly in live Supabase sales intelligence and your Google Cloud API.
                  Search leads, find verified physician decision-makers, and draft targeted
                  outreach.
                </p>
              </div>
              <div className="space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Suggested inquiries
                </div>
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => submit(suggestion)}
                    className="flex min-h-[44px] w-full items-center rounded-lg border border-border/40 bg-surface/40 px-3.5 py-2.5 text-left text-xs font-medium text-foreground/90 transition-all duration-150 hover:border-primary/40 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, messageIndex) => (
                <div
                  key={messageIndex}
                  className={message.role === "user" ? "flex justify-end" : ""}
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[85%] rounded-xl bg-primary px-3.5 py-2.5 text-xs font-medium text-primary-foreground shadow-sm"
                        : "max-w-[96%] space-y-2"
                    }
                  >
                    {message.tools && message.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {message.tools.map((tool, toolIndex) => (
                          <span
                            key={toolIndex}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-surface-2 px-2.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <Wrench className="h-3 w-3 text-primary/70" />
                            <span className="font-mono">{tool.name}</span>
                            <span>· {tool.summary}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {message.role === "assistant" && message.content ? (
                      <div className="prose prose-invert prose-sm max-w-none rounded-xl border border-border/40 bg-surface/60 px-4 py-3 text-xs leading-relaxed prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : message.role === "user" ? (
                      message.content
                    ) : (
                      busy &&
                      messageIndex === messages.length - 1 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          <span>Consulting sales intelligence…</span>
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
          className="flex items-center gap-2 border-t border-border/50 bg-card/60 p-3.5 backdrop-blur-md"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Ask about leads, accounts, decision-makers…"
            className="flex min-h-[44px] flex-1 rounded-lg border border-border/50 bg-surface/60 px-3.5 py-2 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send message"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
