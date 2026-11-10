import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ConversationProvider,
  useConversationClientTool,
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
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
  PhoneCall,
  PhoneOff,
  Mail,
  Eye,
} from "lucide-react";
import {
  copilotChat,
  synthesizeCopilotSpeech,
  checkGeminiApiStatus,
  getElevenLabsConversationToken,
  executeCopilotVoiceTool,
} from "@/lib/copilot.functions";
import {
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
  "Draft a personal outreach email from Mike for our #1 priority lead",
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

type CopilotClientTools = {
  query_territory_leads: (params: { state?: string; search?: string }) => Promise<string>;
  find_clinical_contacts: (params: { state?: string; specialty?: string }) => Promise<string>;
  draft_outreach_email: (params: { hospital: string }) => Promise<string>;
};

export function CopilotPanel(props: CopilotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  return (
    <ConversationProvider
      onMessage={(payload) => {
        const text = payload.message?.trim();
        if (!text) return;
        const role: "user" | "assistant" = payload.source === "user" ? "user" : "assistant";
        setMessages((prev) => [...prev, { role, content: text }]);
      }}
      onError={(err) => {
        console.warn("[elevenlabs] conversation notice:", err);
      }}
    >
      <CopilotPanelInner {...props} messages={messages} setMessages={setMessages} />
    </ConversationProvider>
  );
}

interface CopilotPanelInnerProps extends CopilotPanelProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

function CopilotPanelInner({
  open,
  onClose,
  repName = "Mike",
  leads = [],
  onViewLead,
  onDraftLead,
  onToggleContacted,
  contactedIds = new Set(),
  messages,
  setMessages,
}: CopilotPanelInnerProps) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceRepliesEnabled, setVoiceRepliesEnabled] = useState(true);
  const [continuousVoice, setContinuousVoice] = useState(true);
  const [speakingMessageIdx, setSpeakingMessageIdx] = useState<number | null>(null);

  const send = useServerFn(copilotChat);
  const synthesizeReply = useServerFn(synthesizeCopilotSpeech);
  const checkStatus = useServerFn(checkGeminiApiStatus);
  const fetchElevenLabsToken = useServerFn(getElevenLabsConversationToken);
  const runVoiceTool = useServerFn(executeCopilotVoiceTool);

  // ElevenLabs Conversational AI hooks
  const { startSession, endSession, sendUserMessage, sendContextualUpdate } =
    useConversationControls();
  const { status: convStatus } = useConversationStatus();
  const { isSpeaking: agentSpeaking, isListening: agentListening } = useConversationMode();

  // Push live territory snapshot to the ElevenLabs Conversational Agent on connect
  useEffect(() => {
    if (convStatus !== "connected" || leads.length === 0) return;
    const totalPipeline = leads.reduce((sum, l) => sum + (l.estimatedValueUsd ?? 0), 0);
    const top3 = [...leads]
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 3)
      .map(
        (l, idx) =>
          `${idx + 1}. ${l.hospital || l.title} (${l.territory || "TX"}), Value: $${((l.estimatedValueUsd ?? 0) / 1e6).toFixed(1)}M, Signal: ${l.signalType}, Incumbent: ${l.competitorIncumbent || "Legacy"}, Summary: ${l.summary}`,
      )
      .join(" | ");
    sendContextualUpdate(
      `Live territory snapshot for ${repName} (Philips Sales Rep): $${(totalPipeline / 1e6).toFixed(1)}M across ${leads.length} active accounts. Top priority accounts today: ${top3}`,
    );
  }, [convStatus, leads, repName, sendContextualUpdate]);

  // Register live Philips territory tools for the ElevenLabs Conversational Agent
  useConversationClientTool<CopilotClientTools>("query_territory_leads", async (params) => {
    const res = await runVoiceTool({
      data: {
        toolName: "query_territory_leads",
        parameters: params,
      },
    });
    return JSON.stringify(res);
  });

  useConversationClientTool<CopilotClientTools>("find_clinical_contacts", async (params) => {
    const res = await runVoiceTool({
      data: {
        toolName: "find_clinical_contacts",
        parameters: params,
      },
    });
    return JSON.stringify(res);
  });

  useConversationClientTool<CopilotClientTools>("draft_outreach_email", async (params) => {
    const res = (await runVoiceTool({
      data: {
        toolName: "draft_outreach_email",
        parameters: params,
      },
    })) as {
      drafted?: boolean;
      leadId?: string;
      hospital?: string;
      subject?: string;
      body?: string;
    };

    if (res?.drafted && res.body) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `### Personal Outreach Drafted from Mike (${res.hospital ?? "Hospital Account"})\n\n**Subject:** ${res.subject ?? ""}\n\n\`\`\`text\n${res.body}\n\`\`\``,
          tools: [{ name: "draft_outreach_email", summary: `Drafted for ${res.hospital ?? "account"}` }],
        },
      ]);
      if (res.leadId && onDraftLead) {
        const matched = leads.find((l) => l.id === res.leadId);
        if (matched) {
          onDraftLead(matched);
        }
      }
    }

    return JSON.stringify(res);
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationAnchorRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const latestTranscriptRef = useRef<string>("");
  const replyAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechTokenRef = useRef<number>(0);
  const continuousVoiceRef = useRef(true);

  useEffect(() => {
    continuousVoiceRef.current = continuousVoice;
  }, [continuousVoice]);

  const { data: apiStatus } = useQuery({
    queryKey: ["gemini_api_status"],
    queryFn: () => checkStatus({ data: {} }),
    staleTime: 60 * 1000,
  });

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

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const win = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    const SpeechClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechClass) return;

    stopReplySpeech();
    stopListening();
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
          // Auto-submit in continuous conversation
          void submit(spokenPrompt, { speakReply: true });
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      stopListening();
    }
  }, [stopListening, stopReplySpeech]);

  const speakAssistantReply = useCallback(
    async (text: string, messageIndex: number) => {
      if (!text.trim() || typeof window === "undefined") return;
      stopReplySpeech();

      const token = speechTokenRef.current;
      setSpeakingMessageIdx(messageIndex);

      try {
        const res = await synthesizeReply({
          data: { text },
        });
        if (speechTokenRef.current !== token) return;

        if (res?.audioBase64) {
          const audio = new Audio(resolveAudioDataUri(res.audioBase64));
          replyAudioRef.current = audio;
          audio.onended = () => {
            if (speechTokenRef.current === token) {
              setSpeakingMessageIdx(null);
              if (continuousVoiceRef.current) {
                setTimeout(() => {
                  startListening();
                }, 400);
              }
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

        const spokenText = (res?.spokenText || text).slice(0, 750);
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
              if (continuousVoiceRef.current) {
                setTimeout(() => {
                  startListening();
                }, 400);
              }
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
    [startListening, stopReplySpeech, synthesizeReply],
  );

  const submit = useCallback(
    async (text: string, options?: { speakReply?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      stopReplySpeech();

      if (convStatus === "connected") {
        setInput("");
        sendUserMessage(trimmed);
        return;
      }

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
          data: {
            messages: history.map((m) => ({ role: m.role, content: m.content })),
          },
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
    [
      busy,
      convStatus,
      messages,
      send,
      sendUserMessage,
      setMessages,
      speakAssistantReply,
      stopReplySpeech,
      voiceRepliesEnabled,
    ],
  );

  const startLiveVoiceConversation = useCallback(async () => {
    try {
      stopReplySpeech();
      stopListening();
      const tokenRes = await fetchElevenLabsToken({ data: {} });
      if (tokenRes?.signedUrl) {
        startSession({ signedUrl: tokenRes.signedUrl });
      } else if (tokenRes?.agentId) {
        startSession({ agentId: tokenRes.agentId });
      }
    } catch {
      startListening();
    }
  }, [fetchElevenLabsToken, startListening, startSession, stopListening, stopReplySpeech]);

  const toggleMic = () => {
    if (convStatus === "connected" || convStatus === "connecting") {
      endSession();
      return;
    }
    if (apiStatus?.elevenLabsActive) {
      void startLiveVoiceConversation();
      return;
    }
    if (isListening) {
      stopListening();
      return;
    }
    startListening();
  };

  if (!open) return null;

  const totalPipelineValue = leads.reduce((sum, l) => sum + (l.estimatedValueUsd ?? 0), 0);
  const topPriorityLeads = [...leads]
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />
      <div
        className="relative flex h-full w-full max-w-[620px] flex-col border-l border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex h-16 items-center gap-2 border-b border-border/50 px-4 sm:px-5">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-display text-xs sm:text-sm font-semibold text-foreground">
                Philips Conversational Copilot
              </span>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {repName} · Territory Rep
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {/* ElevenLabs Real-Time Conversational Agent Call Button */}
            {convStatus === "connected" || convStatus === "connecting" ? (
              <button
                type="button"
                onClick={() => endSession()}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 shadow-sm hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300 transition-colors"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>
                  {convStatus === "connecting"
                    ? "Connecting…"
                    : agentSpeaking
                      ? "Agent Speaking…"
                      : agentListening
                        ? "Listening to Mike…"
                        : "Live Voice Active"}
                </span>
                <PhoneOff className="h-3 w-3 ml-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startLiveVoiceConversation()}
                title="Start real-time conversational voice session with your Copilot"
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <PhoneCall className="h-3 w-3" />
                <span>Start Voice Session</span>
              </button>
            )}

            {/* Continuous Voice Toggle */}
            <button
              type="button"
              onClick={() => setContinuousVoice((v) => !v)}
              aria-label={continuousVoice ? "Continuous conversation active" : "Push-to-talk mode"}
              title={
                continuousVoice
                  ? "Continuous Voice: ON (Automatically listens after speaking)"
                  : "Push-to-talk mode (tap mic to speak)"
              }
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                continuousVoice
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/50 bg-surface/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mic className="h-3 w-3" />
              <span className="hidden sm:inline">{continuousVoice ? "Continuous" : "Push-to-talk"}</span>
            </button>

            {/* Audio Mute / Unmute */}
            <button
              type="button"
              onClick={() => {
                if (voiceRepliesEnabled) {
                  stopReplySpeech();
                }
                setVoiceRepliesEnabled((v) => !v);
              }}
              aria-label={voiceRepliesEnabled ? "Mute spoken replies" : "Enable spoken replies"}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                voiceRepliesEnabled
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/50 bg-surface/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {voiceRepliesEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>

            <button
              onClick={onClose}
              aria-label="Close Copilot"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Live ElevenLabs Conversational Agent + Territory Strategy Body */}
        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          {/* Live Conversational Voice Stage (replaces static generic play-button brief) */}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-4 sm:p-5 shadow-lg backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => {
                    if (convStatus === "connected" || convStatus === "connecting") {
                      endSession();
                    } else {
                      void startLiveVoiceConversation();
                    }
                  }}
                  aria-label={
                    convStatus === "connected"
                      ? "End live voice conversation"
                      : "Start live voice conversation with Copilot"
                  }
                  className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    convStatus === "connected"
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.45)]"
                      : "border-primary/50 bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground shadow-[0_0_18px_rgba(14,165,233,0.25)]"
                  }`}
                >
                  {convStatus === "connected" && (
                    <span className="absolute inset-0 rounded-full border border-emerald-400/70 animate-ping opacity-40" />
                  )}
                  {convStatus === "connecting" ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : convStatus === "connected" ? (
                    <PhoneOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-6 w-6" />
                  )}
                </button>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                      ElevenLabs + Gemini Live Agent
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      · ${(totalPipelineValue / 1e6).toFixed(1)}M across {leads.length} accounts
                    </span>
                  </div>
                  <h3 className="font-display text-sm font-semibold text-foreground mt-0.5">
                    {convStatus === "connected"
                      ? agentSpeaking
                        ? `Briefing ${repName} live — interrupt anytime…`
                        : `Listening to ${repName} — ask about any hospital or contact…`
                      : `Talk live with your Philips Territory Strategist, ${repName}`}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {convStatus === "connected"
                      ? "Connected to live territory tools: hospital leads, clinical contacts, and email drafting."
                      : "Tap the mic orb to start a real-time two-way voice conversation about today's priority accounts."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {convStatus === "connected" ? (
                  <button
                    type="button"
                    onClick={() =>
                      sendUserMessage(
                        "Walk me through my top priority hospital accounts for today and who I should reach out to first.",
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Ask for Live Brief</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startLiveVoiceConversation()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    <span>Talk with Agent</span>
                  </button>
                )}
              </div>
            </div>

            {/* Priority Accounts Quick-Action Strip */}
            {topPriorityLeads.length > 0 && (
              <div className="mt-4 border-t border-border/50 pt-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Priority Accounts Ready for Live Discussion
                  </span>
                </div>
                <div className="space-y-2">
                  {topPriorityLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-border/50 bg-surface/50 px-3 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground truncate">
                            {lead.hospital || lead.title}
                          </span>
                          {lead.territory && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              {lead.territory}
                            </span>
                          )}
                          {lead.estimatedValueUsd && (
                            <span className="text-[11px] font-mono text-emerald-400">
                              ${(lead.estimatedValueUsd / 1e6).toFixed(1)}M
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {lead.summary}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const prompt = `Tell me about the opportunity at ${lead.hospital || lead.title} and how I should position Philips equipment.`;
                            if (convStatus === "connected") {
                              sendUserMessage(prompt);
                            } else {
                              void submit(prompt, { speakReply: true });
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          <Mic className="h-3 w-3" />
                          <span>Discuss</span>
                        </button>
                        {onDraftLead && (
                          <button
                            type="button"
                            onClick={() => onDraftLead(lead)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 transition-colors"
                          >
                            <Mail className="h-3 w-3 text-primary" />
                            <span>Draft Email</span>
                          </button>
                        )}
                        {onViewLead && (
                          <button
                            type="button"
                            onClick={() => onViewLead(lead)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-surface px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            title="View Account Dossier"
                          >
                            <Eye className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

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
                                <span>Listen (Aoede)</span>
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

        {/* Input Bar with Continuous Hands-Free Voice Mic */}
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
              title={
                isListening
                  ? "Stop listening"
                  : continuousVoice
                    ? "Continuous Voice: Tap to start speaking"
                    : "Speak to Gemini"
              }
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isListening
                  ? "border-primary bg-primary/20 text-primary shadow-md animate-pulse"
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
                : continuousVoice
                  ? "Talk or type to Gemini (Continuous Voice active)…"
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
