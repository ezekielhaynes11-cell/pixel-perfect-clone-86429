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
  VolumeX,
  Square,
} from "lucide-react";
import { copilotChat, synthesizeCopilotSpeech } from "@/lib/copilot.functions";
import {
  CopilotVoiceAgent,
  resolveAudioDataUri,
  selectBestNaturalVoice,
} from "./CopilotVoiceAgent";
import type { Lead } from "@/data/leads";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: Array<{ name: string; summary: string }>;
}

const SUGGESTIONS = [
  "Walk me through the top 3 accounts I should call first today and why",
  "Which Texas or Oklahoma hospitals have urgent ultrasound or cath lab signals?",
  "Find verified physician decision-makers in Arkansas and Louisiana",
  "Draft a personal outreach email from Mike Patrick for our #1 priority lead",
];

export interface CopilotPanelProps {
  open: boolean;
  onClose: () => void;
  repName?: string;
  leads?: Lead[];
  onViewLead?: (lead: Lead) => void;
  onDraftLead?: (lead: Lead) => void;
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
      isFinal?: boolean;
    };
    length?: number;
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
  repName = "Mike Patrick",
  leads = [],
  onViewLead,
  onDraftLead,
  onToggleContacted,
  contactedIds = new Set(),
}: CopilotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceRepliesEnabled, setVoiceRepliesEnabled] = useState(true);
  const [speakingMessageIdx, setSpeakingMessageIdx] = useState<number | null>(null);

  const send = useServerFn(copilotChat);
  const synthesizeReply = useServerFn(synthesizeCopilotSpeech);

  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationAnchorRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const latestTranscriptRef = useRef<string>("");
  const replyAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechTokenRef = useRef<number>(0);

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

  const stopReplySpeech = useCallback(() => {
    speechTokenRef.current += 1;
    if (replyAudioRef.current) {
      replyAudioRef.current.pause();
      replyAudioRef.current.currentTime = 0;
      replyAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageIdx(null);
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
      stopReplySpeech();
    };
  }, [stopListening, stopReplySpeech]);

  useEffect(() => {
    if (!open) {
      stopListening();
      stopReplySpeech();
    }
  }, [open, stopListening, stopReplySpeech]);

  const speakAssistantReply = useCallback(
    async (text: string, messageIndex: number) => {
      if (!text.trim() || typeof window === "undefined") return;
      stopReplySpeech();

      const token = speechTokenRef.current;
      setSpeakingMessageIdx(messageIndex);

      try {
        const res = await synthesizeReply({ data: { text } });
        if (speechTokenRef.current !== token) return;

        if (res?.audioBase64) {
          const audio = new Audio(resolveAudioDataUri(res.audioBase64));
          replyAudioRef.current = audio;
          audio.onended = () => {
            if (speechTokenRef.current === token) {
              setSpeakingMessageIdx(null);
            }
          };
          audio.onerror = () => {
            if (speechTokenRef.current === token) {
              setSpeakingMessageIdx(null);
            }
          };
          await audio.play();
          return;
        }

        const spokenText = (res?.cleanedText || text).slice(0, 750);
        if ("speechSynthesis" in window) {
          const preferredVoice = await selectBestNaturalVoice();
          if (speechTokenRef.current !== token) return;

          const utterance = new SpeechSynthesisUtterance(spokenText);
          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }
          utterance.rate = 0.98;
          utterance.pitch = 1.0;
          utterance.onend = () => {
            if (speechTokenRef.current === token) {
              setSpeakingMessageIdx(null);
            }
          };
          utterance.onerror = () => {
            if (speechTokenRef.current === token) {
              setSpeakingMessageIdx(null);
            }
          };
          window.speechSynthesis.speak(utterance);
        } else {
          setSpeakingMessageIdx(null);
        }
      } catch {
        if (speechTokenRef.current === token) {
          setSpeakingMessageIdx(null);
        }
      }
    },
    [stopReplySpeech, synthesizeReply],
  );

  const submit = useCallback(
    async (text: string, options?: { speakReply?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      stopReplySpeech();

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const history = [...messages, userMsg];
      const assistantMessageIndex = history.length;

      setMessages([...history, { role: "assistant", content: "", tools: [] }]);
      setInput("");
      setBusy(true);

      setTimeout(() => {
        conversationAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 60);

      let finalAssistantText = "";

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
            finalAssistantText += event.text;
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

        const shouldSpeak = options?.speakReply ?? voiceRepliesEnabled;
        if (shouldSpeak && finalAssistantText.trim()) {
          void speakAssistantReply(finalAssistantText, assistantMessageIndex);
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
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        }, 80);
      }
    },
    [busy, messages, send, speakAssistantReply, stopReplySpeech, voiceRepliesEnabled],
  );

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

    stopReplySpeech();
    latestTranscriptRef.current = "";

    try {
      const recognition = new SpeechClass();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          latestTranscriptRef.current = transcript;
          setInput(transcript);
        }
      };

      recognition.onerror = () => {
        stopListening();
      };

      recognition.onend = () => {
        stopListening();
        const spokenPrompt = latestTranscriptRef.current.trim();
        if (spokenPrompt) {
          latestTranscriptRef.current = "";
          setVoiceRepliesEnabled(true);
          void submit(spokenPrompt, { speakReply: true });
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      stopListening();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />
      <div
        className="relative flex h-full w-full max-w-[600px] flex-col border-l border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex h-16 items-center gap-2.5 border-b border-border/50 px-5">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold text-foreground">
                Gemini Sales Copilot
              </span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Mike Patrick · Philips
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (voiceRepliesEnabled) {
                stopReplySpeech();
              }
              setVoiceRepliesEnabled((v) => !v);
            }}
            aria-label={voiceRepliesEnabled ? "Mute spoken replies" : "Enable spoken replies"}
            className={`ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              voiceRepliesEnabled
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/50 bg-surface/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {voiceRepliesEnabled ? (
              <>
                <Volume2 className="h-3.5 w-3.5" />
                <span>Voice Reply On</span>
              </>
            ) : (
              <>
                <VolumeX className="h-3.5 w-3.5" />
                <span>Voice Muted</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            aria-label="Close Copilot"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Unified Gemini Voice Briefing + Live Conversation Body */}
        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          {/* Calm Gemini Morning Briefing + Priority Target Cards */}
          <CopilotVoiceAgent
            repName={repName}
            territoryStates={["TX", "OK", "AR", "LA"]}
            leads={leads}
            onViewLead={onViewLead}
            onDraftLead={onDraftLead}
            onToggleContacted={onToggleContacted}
            onAskGeminiAboutLead={(prompt) => {
              void submit(prompt, { speakReply: voiceRepliesEnabled });
            }}
            contactedIds={contactedIds}
          />

          {/* Live Multi-Turn Gemini Intelligence Conversation */}
          <div
            ref={conversationAnchorRef}
            className="space-y-3 border-t border-border/40 pt-4"
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Live Gemini Strategy Conversation
              </div>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    stopReplySpeech();
                    setMessages([]);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear thread
                </button>
              )}
            </div>

            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Ask me anything by voice or text about your territory accounts, physician contacts,
                  competitive displacement angles, or have me draft a personal email from you.
                </p>
                <div className="grid grid-cols-1 gap-2 pt-1">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => void submit(suggestion, { speakReply: voiceRepliesEnabled })}
                      className="flex items-center rounded-lg border border-border/40 bg-surface/40 px-3.5 py-2.5 text-left text-xs font-medium text-foreground/90 transition-all duration-150 hover:border-primary/40 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                          : "max-w-[98%] space-y-2"
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
                        <div className="rounded-xl border border-border/40 bg-surface/60 px-4 py-3 text-xs leading-relaxed">
                          <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>
                          <div className="mt-2 flex items-center justify-end border-t border-border/30 pt-2">
                            {speakingMessageIdx === messageIndex ? (
                              <button
                                type="button"
                                onClick={stopReplySpeech}
                                className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/25"
                              >
                                <Square className="h-3 w-3 fill-current" />
                                <span>Stop speaking</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void speakAssistantReply(message.content, messageIndex)}
                                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                              >
                                <Volume2 className="h-3 w-3" />
                                <span>Listen</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : message.role === "user" ? (
                        message.content
                      ) : (
                        busy &&
                        messageIndex === messages.length - 1 && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span>Gemini is analyzing live territory intelligence…</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Input Bar with Hands-Free Voice Conversation Mic */}
        <form
          className="flex items-center gap-2 border-t border-border/50 bg-card/60 p-3.5 backdrop-blur-md"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(input, { speakReply: voiceRepliesEnabled });
          }}
        >
          {speechSupported && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={isListening ? "Stop listening" : "Talk to Gemini with voice"}
              title={isListening ? "Stop listening" : "Speak to Gemini hands-free"}
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isListening
                  ? "border-primary bg-primary/20 text-primary shadow-md"
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
                ? "Listening to you, Mike — speak naturally…"
                : "Talk or type to Gemini about your territory leads…"
            }
            className={`flex min-h-[44px] flex-1 rounded-lg border px-3.5 py-2 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary ${
              isListening
                ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40"
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
