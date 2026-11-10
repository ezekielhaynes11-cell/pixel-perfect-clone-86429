import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Send,
  X,
  Loader2,
  Wrench,
  Mic,
  MicOff,
  Volume2,
  MessageSquare,
} from "lucide-react";
import { copilotChat } from "@/lib/copilot.functions";
import { CopilotVoiceAgent } from "./CopilotVoiceAgent";
import type { Lead } from "@/data/leads";

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

export interface CopilotPanelProps {
  open: boolean;
  onClose: () => void;
  repName?: string;
  leads?: Lead[];
  onViewLead?: (lead: Lead) => void;
  onDraftLead?: (lead: Lead) => void;
  onPitchDeckLead?: (lead: Lead) => void;
  onToggleContacted?: (leadId: string) => void;
  contactedIds?: Set<string>;
}

// Browser SpeechRecognition interface
interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

export function CopilotPanel({
  open,
  onClose,
  repName = "Mike",
  leads = [],
  onViewLead,
  onDraftLead,
  onPitchDeckLead,
  onToggleContacted,
  contactedIds = new Set(),
}: CopilotPanelProps) {
  const [activeTab, setActiveTab] = useState<"voice" | "chat">("voice");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const send = useServerFn(copilotChat);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as unknown as {
        SpeechRecognition?: new () => BrowserSpeechRecognition;
        webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
      };
      const hasSupport = Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
      setSpeechSupported(hasSupport);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore if already stopped
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeTab]);

  const toggleMic = () => {
    if (isListening) {
      stopListening();
      return;
    }

    if (typeof window === "undefined") return;
    const win = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    const SpeechClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechClass) return;

    try {
      const recognition = new SpeechClass();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setInput(transcript);
        }
      };

      recognition.onerror = () => {
        stopListening();
      };

      recognition.onend = () => {
        stopListening();
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      stopListening();
    }
  };

  const submit = async (text: string) => {
    if (!text.trim() || busy) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "", tools: [] }]);
    setInput("");
    setBusy(true);
    if (activeTab !== "chat") {
      setActiveTab("chat");
    }

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
        className="relative flex h-full w-full max-w-[580px] flex-col border-l border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex h-16 items-center gap-2.5 border-b border-border/50 px-5">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-display font-semibold text-foreground">Copilot</span>

          {/* Navigation Tabs */}
          <div className="ml-3 flex rounded-lg border border-border/60 bg-surface/80 p-0.5 text-xs">
            <button
              onClick={() => setActiveTab("voice")}
              aria-label="Morning voice agent tab"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-all duration-150 ${
                activeTab === "voice"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>Voice Agent</span>
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              aria-label="Interactive intelligence chat tab"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-all duration-150 ${
                activeTab === "chat"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Chat</span>
              {messages.length > 0 && (
                <span className="ml-1 rounded-full bg-surface-2 px-1.5 py-0.2 text-[9px]">
                  {messages.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Copilot"
            className="ml-auto flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Body Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5">
          {activeTab === "voice" ? (
            <div>
              {/* Voice Agent Briefing & Tactical Game Plan Stream */}
              <CopilotVoiceAgent
                repName={repName}
                territoryStates={["TX", "OK", "AR", "LA"]}
                leads={leads}
                onViewLead={onViewLead}
                onDraftLead={onDraftLead}
                onPitchDeckLead={onPitchDeckLead}
                onToggleContacted={onToggleContacted}
                contactedIds={contactedIds}
              />

              {/* Quick Prompt Transition to Chat */}
              <div className="rounded-xl border border-border/40 bg-surface/40 p-3.5 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    Have questions about these accounts?
                  </span>
                  <button
                    onClick={() => setActiveTab("chat")}
                    className="font-medium text-primary hover:underline"
                  >
                    Open Chat Inquiries →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
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
          )}
        </div>

        {/* Input Bar with Hands-Free Mic Button */}
        <form
          className="flex items-center gap-2 border-t border-border/50 bg-card/60 p-3.5 backdrop-blur-md"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          {speechSupported && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={isListening ? "Stop listening" : "Start voice speech recognition"}
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isListening
                  ? "border-red-500/60 bg-red-500/20 text-red-400 animate-pulse shadow-md"
                  : "border-border/50 bg-surface/60 text-muted-foreground hover:bg-surface hover:text-foreground"
              }`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={
              isListening
                ? "Listening to your question…"
                : "Ask about leads, accounts, or tactical next steps…"
            }
            className={`flex min-h-[44px] flex-1 rounded-lg border px-3.5 py-2 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary ${
              isListening
                ? "border-red-500/50 bg-red-500/5 ring-1 ring-red-500/40"
                : "border-border/50 bg-surface/60"
            }`}
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
