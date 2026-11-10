import { useState, useEffect, useRef, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Play,
  Pause,
  Volume2,
  Sparkles,
  Mail,
  Eye,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getVoiceAgentBriefing } from "@/lib/copilot.functions";
import type { Lead } from "@/data/leads";

// Ranked natural voices (prioritizes cloud neural & enhanced voices; blocks legacy robotic synths)
const PREFERRED_VOICE_PATTERNS = [
  /Google US English/i,
  /Microsoft Aria Online \(Natural\)/i,
  /Microsoft Jenny Online \(Natural\)/i,
  /Microsoft Guy Online \(Natural\)/i,
  /Ava \(Premium\)/i,
  /Ava \(Enhanced\)/i,
  /Samantha \(Enhanced\)/i,
  /Allison \(Enhanced\)/i,
  /Ava/i,
  /Samantha/i,
  /Google UK English Female/i,
];

const BLOCKED_ROBOTIC_VOICES =
  /\b(Alex|Fred|Junior|Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Pipe Organ|Trinoids|Whisper|Zarvox|Ralph|Kathy|Vicki)\b/i;

export function selectBestNaturalVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const englishVoices = voices.filter(
    (v) => v.lang.toLowerCase().startsWith("en") && !BLOCKED_ROBOTIC_VOICES.test(v.name),
  );
  if (englishVoices.length === 0) return voices[0] ?? null;

  for (const pattern of PREFERRED_VOICE_PATTERNS) {
    const match = englishVoices.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  const USVoice = englishVoices.find(
    (v) => v.lang.toLowerCase() === "en-us" && !v.localService,
  );
  if (USVoice) return USVoice;

  return (
    englishVoices.find((v) => v.lang.toLowerCase() === "en-us") ?? englishVoices[0] ?? null
  );
}

export function resolveAudioDataUri(audioBase64: string): string {
  // WAV header "RIFF" encodes to "UklGR" in base64
  const mime = audioBase64.startsWith("UklGR") ? "audio/wav" : "audio/mp3";
  return `data:${mime};base64,${audioBase64}`;
}

export interface CopilotVoiceAgentProps {
  repName?: string;
  territoryStates?: string[];
  leads?: Lead[];
  onViewLead?: (lead: Lead) => void;
  onDraftLead?: (lead: Lead) => void;
  onToggleContacted?: (leadId: string) => void;
  onAskGeminiAboutLead?: (prompt: string) => void;
  contactedIds?: Set<string>;
  apiKey?: string;
  onFinishedBriefing?: () => void;
}

export function CopilotVoiceAgent({
  repName = "Mike",
  territoryStates = ["TX", "OK", "AR", "LA"],
  leads = [],
  onViewLead,
  onDraftLead,
  onToggleContacted,
  onAskGeminiAboutLead,
  contactedIds = new Set(),
  apiKey,
  onFinishedBriefing,
}: CopilotVoiceAgentProps) {
  const fetchBriefing = useServerFn(getVoiceAgentBriefing);

  const {
    data: briefing,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["voice_agent_briefing", repName, territoryStates.join(","), apiKey],
    queryFn: () =>
      fetchBriefing({
        data: {
          repName,
          territoryStates,
          apiKey,
        },
      }),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [targetsExpanded, setTargetsExpanded] = useState(true);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sentenceTimeoutRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  // Load browser voices asynchronously so neural voices are ready
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const updateVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) setAvailableVoices(list);
    };
    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
    };
  }, []);

  const stopPlayback = useCallback(() => {
    cancelledRef.current = true;
    if (sentenceTimeoutRef.current) {
      window.clearTimeout(sentenceTimeoutRef.current);
      sentenceTimeoutRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  // Reset cached audio element when briefing updates
  useEffect(() => {
    audioRef.current = null;
  }, [briefing?.audioBase64, briefing?.spokenScript]);

  const playViaNaturalSentenceSpeech = useCallback(
    (script: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      cancelledRef.current = false;

      const voices =
        availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
      const chosenVoice = selectBestNaturalVoice(voices);

      // Split into natural conversational sentences so prosody is smooth and never robotic
      const sentences = script
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (sentences.length === 0) return;
      setIsPlaying(true);

      let index = 0;
      const speakNextSentence = () => {
        if (cancelledRef.current || index >= sentences.length) {
          setIsPlaying(false);
          return;
        }
        const utterance = new SpeechSynthesisUtterance(sentences[index]);
        if (chosenVoice) utterance.voice = chosenVoice;
        utterance.rate = 0.99;
        utterance.pitch = 1.0;

        utterance.onend = () => {
          index += 1;
          if (cancelledRef.current || index >= sentences.length) {
            setIsPlaying(false);
            return;
          }
          // Natural conversational pause between sentences
          sentenceTimeoutRef.current = window.setTimeout(speakNextSentence, 160);
        };

        utterance.onerror = () => {
          setIsPlaying(false);
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNextSentence();
    },
    [availableVoices],
  );

  const togglePlay = () => {
    if (!briefing) return;

    if (isPlaying) {
      stopPlayback();
      return;
    }

    cancelledRef.current = false;

    if (briefing.audioBase64) {
      try {
        if (!audioRef.current) {
          const audio = new Audio(resolveAudioDataUri(briefing.audioBase64));
          audio.onended = () => setIsPlaying(false);
          audio.onerror = () => playViaNaturalSentenceSpeech(briefing.spokenScript);
          audioRef.current = audio;
        }
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => playViaNaturalSentenceSpeech(briefing.spokenScript));
        return;
      } catch {
        playViaNaturalSentenceSpeech(briefing.spokenScript);
        return;
      }
    }

    playViaNaturalSentenceSpeech(briefing.spokenScript);
  };

  const findLeadById = (leadId: string): Lead | undefined => {
    return leads.find((l) => l.id === leadId);
  };

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-border/60 bg-card/90 shadow-lg backdrop-blur-md">
      {/* Calm Executive Gemini Briefing Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Calm Gemini Conversational Orb */}
            <button
              type="button"
              onClick={togglePlay}
              disabled={isLoading || !briefing}
              aria-label={isPlaying ? "Pause Gemini voice briefing" : "Play Gemini voice briefing"}
              className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 ${
                isPlaying
                  ? "border-primary bg-primary text-primary-foreground shadow-[0_0_20px_rgba(14,165,233,0.4)]"
                  : "border-primary/40 bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground"
              }`}
            >
              {isPlaying && (
                <span className="absolute inset-0 rounded-full border border-primary/60 animate-ping opacity-30" />
              )}
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 translate-x-0.5" />
              )}
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Gemini Territory Strategist
                </span>
                {briefing && (
                  <span className="text-[11px] text-muted-foreground">
                    · ${(briefing.pipelineValueUsd / 1e6).toFixed(1)}M across {briefing.leadCount}{" "}
                    accounts
                  </span>
                )}
              </div>
              <h3 className="font-display text-sm font-semibold text-foreground">
                Morning Briefing for {repName} · Philips Sales Rep
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePlay}
              disabled={isLoading || !briefing}
              className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>{isPlaying ? "Pause Voice" : "Listen"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                stopPlayback();
                refetch();
              }}
              disabled={isLoading || isRefetching}
              title="Refresh briefing"
              aria-label="Refresh morning briefing"
              className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-border/50 bg-surface/60 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading || isRefetching ? "animate-spin text-primary" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Conversational Briefing Prose */}
        <div className="mt-3.5 rounded-xl border border-border/40 bg-surface/50 p-3.5 text-xs leading-relaxed text-foreground/90">
          {isLoading ? (
            <div className="flex items-center gap-2 py-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Synthesizing today's territory intelligence for {repName}…</span>
            </div>
          ) : briefing?.spokenScript ? (
            <p className="text-xs leading-relaxed text-foreground/90">{briefing.spokenScript}</p>
          ) : (
            <p className="text-muted-foreground">
              Good morning, {repName}. Ask me anything below or click Listen to hear your territory
              recap.
            </p>
          )}
        </div>
      </div>

      {/* Collapsible Top Priority Targets */}
      {briefing && briefing.gamePlan.length > 0 && (
        <div className="border-t border-border/40 bg-surface/30 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setTargetsExpanded((v) => !v)}
            className="flex w-full items-center justify-between text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              Today's Priority Accounts ({briefing.gamePlan.length})
            </span>
            {targetsExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {targetsExpanded && (
            <div className="mt-3 space-y-2.5">
              {briefing.gamePlan.map((item, idx) => {
                const fullLead = findLeadById(item.leadId);
                const isContacted = contactedIds.has(item.leadId);

                return (
                  <div
                    key={item.leadId || idx}
                    className="rounded-xl border border-border/50 bg-card/85 p-3 transition-colors hover:border-primary/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded border border-border/60 bg-surface px-1.5 py-0.5 text-[10px] font-bold uppercase text-foreground/80">
                          {item.state}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {item.hospital}
                        </span>
                      </div>
                      {item.estimatedValueUsd ? (
                        <span className="text-xs font-semibold tabular-nums text-emerald-400">
                          ${(item.estimatedValueUsd / 1e6).toFixed(1)}M
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="font-medium text-primary/90">
                        {item.recommendedModality}
                      </span>
                      {item.incumbentToDisplace && (
                        <span>· Displacing {item.incumbentToDisplace}</span>
                      )}
                      {item.contactName && <span>· {item.contactName}</span>}
                    </div>

                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {item.tacticalAngle}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2 pt-2 border-t border-border/30">
                      {onDraftLead && fullLead && (
                        <button
                          type="button"
                          onClick={() => onDraftLead(fullLead)}
                          className="flex min-h-[32px] items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                          <Mail className="h-3 w-3" />
                          <span>Draft Personal Email</span>
                        </button>
                      )}

                      {onAskGeminiAboutLead && (
                        <button
                          type="button"
                          onClick={() =>
                            onAskGeminiAboutLead(
                              `Give me a tactical strategy for ${item.hospital} (${item.state}) as Mike, including how to position ${item.recommendedModality} against ${item.incumbentToDisplace || "their incumbent system"} and who I should contact first.`,
                            )
                          }
                          className="flex min-h-[32px] items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                        >
                          <MessageSquare className="h-3 w-3" />
                          <span>Discuss Strategy</span>
                        </button>
                      )}

                      {onViewLead && fullLead && (
                        <button
                          type="button"
                          onClick={() => onViewLead(fullLead)}
                          className="flex min-h-[32px] items-center gap-1 rounded-lg border border-border/50 bg-surface/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Inspect</span>
                        </button>
                      )}

                      {onToggleContacted && (
                        <button
                          type="button"
                          onClick={() => onToggleContacted(item.leadId)}
                          className={`ml-auto flex min-h-[32px] items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                            isContacted
                              ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                              : "border border-border/50 bg-surface/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>{isContacted ? "Contacted" : "Mark Contacted"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
