import { useState, useEffect, useRef, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  Mail,
  Presentation,
  Eye,
  CheckCircle2,
  Building2,
  Target,
  Activity,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  getVoiceAgentBriefing,
  type VoiceAgentBriefingResponse,
  type GamePlanItem,
} from "@/lib/copilot.functions";
import type { Lead } from "@/data/leads";

interface CopilotVoiceAgentProps {
  repName?: string;
  territoryStates?: string[];
  leads?: Lead[];
  onViewLead?: (lead: Lead) => void;
  onDraftLead?: (lead: Lead) => void;
  onPitchDeckLead?: (lead: Lead) => void;
  onToggleContacted?: (leadId: string) => void;
  contactedIds?: Set<string>;
}

export function CopilotVoiceAgent({
  repName = "Mike",
  territoryStates = ["TX", "OK", "AR", "LA"],
  leads = [],
  onViewLead,
  onDraftLead,
  onPitchDeckLead,
  onToggleContacted,
  contactedIds = new Set(),
}: CopilotVoiceAgentProps) {
  const fetchBriefing = useServerFn(getVoiceAgentBriefing);

  const {
    data: briefing,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ["voice_agent_briefing", repName, territoryStates.join(",")],
    queryFn: () =>
      fetchBriefing({
        data: {
          repName,
          territoryStates,
        },
      }),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<1.0 | 1.25 | 1.5>(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0); // 0 to 100
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSpeakingWebSpeech, setIsSpeakingWebSpeech] = useState(false);

  // Audio elements & Web Audio API refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  // Waveform bar heights (16 bars)
  const [waveformBars, setWaveformBars] = useState<number[]>(
    Array.from({ length: 16 }, () => 20),
  );

  // Stop all playback (both native audio and Web Speech)
  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setIsPlaying(false);
    setIsSpeakingWebSpeech(false);
    setAudioProgress(0);
    setElapsedSeconds(0);
    setWaveformBars(Array.from({ length: 16 }, () => 20));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => undefined);
      }
    };
  }, [stopPlayback]);

  // Update playback rate on active player
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Web Speech synthetic waveform generator
  const runSyntheticWaveform = useCallback(() => {
    let tick = 0;
    const animate = () => {
      tick++;
      setWaveformBars((prev) =>
        prev.map((_, i) => {
          // Dynamic harmonic motion simulating human speech rhythm
          const base = 25 + Math.sin((tick * 0.15) + (i * 0.4)) * 30;
          const variance = Math.cos((tick * 0.08) - (i * 0.3)) * 25;
          return Math.max(15, Math.min(95, Math.round(base + variance)));
        }),
      );
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  }, []);

  // Web Audio real frequency analyser loop
  const runAudioAnalyserLoop = useCallback(() => {
    if (!analyserRef.current) {
      runSyntheticWaveform();
      return;
    }

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkAudioFrequency = () => {
      analyser.getByteFrequencyData(dataArray);

      // Downsample into 16 equalizer frequency bands
      const step = Math.floor(bufferLength / 16);
      const newBars: number[] = [];
      for (let i = 0; i < 16; i++) {
        const val = dataArray[i * step] || 0;
        const normalized = Math.max(15, Math.min(95, Math.round((val / 255) * 100)));
        newBars.push(normalized);
      }
      setWaveformBars(newBars);
      animFrameRef.current = requestAnimationFrame(checkAudioFrequency);
    };

    animFrameRef.current = requestAnimationFrame(checkAudioFrequency);
  }, [runSyntheticWaveform]);

  // Playback Toggle Handler
  const togglePlay = () => {
    if (!briefing) return;

    if (isPlaying) {
      stopPlayback();
      return;
    }

    // Branch A: Primary Google Cloud TTS Audio Stream
    if (briefing.audioBase64) {
      try {
        if (!audioRef.current) {
          const audio = new Audio(`data:audio/mp3;base64,${briefing.audioBase64}`);
          audio.playbackRate = playbackRate;
          audio.muted = isMuted;

          audio.onended = () => {
            stopPlayback();
          };

          audio.ontimeupdate = () => {
            if (audio.duration && !Number.isNaN(audio.duration)) {
              setAudioProgress((audio.currentTime / audio.duration) * 100);
              setElapsedSeconds(Math.round(audio.currentTime));
            }
          };

          audio.onerror = () => {
            // Fall back to Web Speech if audio format or blob fails
            playViaWebSpeech();
          };

          audioRef.current = audio;

          // Wire Web Audio Analyser if supported
          try {
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 64;
              const source = ctx.createMediaElementSource(audio);
              source.connect(analyser);
              analyser.connect(ctx.destination);
              audioContextRef.current = ctx;
              analyserRef.current = analyser;
              sourceNodeRef.current = source;
            }
          } catch {
            // Ignore Web Audio CORS/restriction, fallback to synthetic waveform
          }
        }

        if (audioContextRef.current && audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume().catch(() => undefined);
        }

        audioRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
            runAudioAnalyserLoop();
          })
          .catch(() => {
            playViaWebSpeech();
          });

        return;
      } catch {
        playViaWebSpeech();
        return;
      }
    }

    // Branch B: Zero-Downtime Native Browser Web Speech Fallback
    playViaWebSpeech();
  };

  const playViaWebSpeech = () => {
    if (!briefing?.spokenScript || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(briefing.spokenScript);
    utterance.rate = playbackRate;
    utterance.pitch = 1.0;

    // Pick natural English voice if present
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Natural") ||
            v.name.includes("Google") ||
            v.name.includes("Samantha") ||
            v.name.includes("Alex") ||
            v.name.includes("Guy") ||
            v.name.includes("Jenny")),
      ) || voices.find((v) => v.lang.startsWith("en")) || voices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    const estimatedDuration = briefing.durationEstimateSeconds || 45;
    let secondsCounter = 0;

    progressTimerRef.current = window.setInterval(() => {
      secondsCounter += 1;
      setElapsedSeconds(secondsCounter);
      setAudioProgress(Math.min(100, (secondsCounter / estimatedDuration) * 100));
    }, 1000);

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsSpeakingWebSpeech(true);
      runSyntheticWaveform();
    };

    utterance.onend = () => {
      stopPlayback();
    };

    utterance.onerror = () => {
      stopPlayback();
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleSpeedChange = () => {
    const nextRate: 1.0 | 1.25 | 1.5 =
      playbackRate === 1.0 ? 1.25 : playbackRate === 1.25 ? 1.5 : 1.0;
    setPlaybackRate(nextRate);
    if (isPlaying) {
      stopPlayback();
      setTimeout(togglePlay, 100);
    }
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (audioRef.current) {
      audioRef.current.muted = nextMute;
    }
  };

  // Helper to find lead object for triggers
  const findLeadById = (leadId: string): Lead | undefined => {
    return leads.find((l) => l.id === leadId);
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const totalEstimate = briefing?.durationEstimateSeconds ?? 50;

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/10 via-card/90 to-card/95 shadow-xl backdrop-blur-md transition-all duration-200">
      {/* Top Banner: Voice Agent Hero */}
      <div className="border-b border-border/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/50 bg-primary/20 text-primary shadow-sm">
              <Sparkles className="h-4 w-4 animate-pulse" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Philips Voice Copilot
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.2 text-[9px] font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>
              <h3 className="font-display text-sm font-semibold text-foreground">
                Good morning, {repName}
              </h3>
            </div>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            aria-label="Refresh morning voice briefing"
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border/50 bg-surface/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading || isRefetching ? "animate-spin text-primary" : ""}`}
            />
            <span className="text-[11px]">Sync Brief</span>
          </button>
        </div>

        {/* Territory Status Overview */}
        {briefing && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-surface/50 px-2.5 py-1">
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium text-foreground">
                ${(briefing.pipelineValueUsd / 1e6).toFixed(1)}M
              </span>
              <span className="text-[11px] text-muted-foreground">In Territory Pipeline</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-surface/50 px-2.5 py-1">
              <Target className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-medium text-foreground">{briefing.leadCount}</span>
              <span className="text-[11px] text-muted-foreground">Hospital Accounts</span>
            </div>
          </div>
        )}

        {/* Pulsing Audio Waveform Visualizer */}
        <div className="mt-4 rounded-xl border border-border/50 bg-surface/40 p-3.5 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">Morning Audio Recap</span>
              {isSpeakingWebSpeech && (
                <span className="rounded bg-surface-2 px-1.5 py-0.2 text-[9px] text-muted-foreground">
                  Web Speech Mode
                </span>
              )}
            </div>
            <span className="font-mono text-[10px] tabular-nums text-foreground/80">
              {formatSeconds(elapsedSeconds)} / {formatSeconds(totalEstimate)}
            </span>
          </div>

          {/* Equalizer Frequency Bars */}
          <div className="flex h-12 items-end justify-between gap-1 px-1">
            {waveformBars.map((height, i) => (
              <div
                key={i}
                className="w-full rounded-full transition-all duration-75"
                style={{
                  height: `${height}%`,
                  backgroundColor: isPlaying
                    ? i % 2 === 0
                      ? "rgb(var(--primary, 14 165 233))"
                      : "rgb(52 211 153)"
                    : "rgba(148, 163, 184, 0.25)",
                  boxShadow: isPlaying
                    ? "0 0 10px rgba(52, 211, 153, 0.3)"
                    : "none",
                }}
              />
            ))}
          </div>

          {/* Progress scrubber bar */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-200"
              style={{ width: `${audioProgress}%` }}
            />
          </div>

          {/* Audio Controls */}
          <div className="mt-3 flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                disabled={isLoading}
                aria-label={isPlaying ? "Pause briefing" : "Play briefing"}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-all duration-150 hover:scale-105 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 translate-x-0.5" />
                )}
              </button>

              <button
                onClick={stopPlayback}
                disabled={!isPlaying && audioProgress === 0}
                aria-label="Replay audio"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-border/50 bg-surface/50 text-muted-foreground transition-all duration-150 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                onClick={handleSpeedChange}
                aria-label={`Playback speed: ${playbackRate}x`}
                className="flex min-h-[40px] px-2.5 items-center justify-center rounded-lg border border-border/50 bg-surface/50 text-[11px] font-semibold text-foreground transition-all duration-150 hover:border-primary/40 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {playbackRate}x
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {briefing?.audioBase64 && (
                <button
                  onClick={handleToggleMute}
                  aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                  className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-border/50 bg-surface/50 text-muted-foreground transition-all duration-150 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {isMuted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}

              <button
                onClick={() => setShowTranscript(!showTranscript)}
                aria-label="Toggle transcript"
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border/50 bg-surface/50 px-2.5 text-xs font-medium text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-medium">Transcript</span>
                {showTranscript ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Expandable Transcript */}
          {showTranscript && briefing?.spokenScript && (
            <div className="mt-3 rounded-lg border border-border/40 bg-card/90 p-3 text-xs leading-relaxed text-foreground/90 animate-in fade-in duration-200">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                Spoken Briefing Script
              </div>
              <p className="whitespace-pre-line text-muted-foreground">
                {briefing.spokenScript}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tactical Game Plan Section */}
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Tactical Game Plan · Top Targets
            </span>
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {briefing?.gamePlan.length || 0} Priority Actions
          </span>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Analyzing hospital intelligence and competitive displacement...</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            Unable to load voice briefing. Please click "Sync Brief" to retry.
          </div>
        ) : !briefing || briefing.gamePlan.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-surface/40 p-4 text-center text-xs text-muted-foreground">
            No priority targets identified in active scope.
          </div>
        ) : (
          <div className="space-y-3">
            {briefing.gamePlan.map((item, idx) => {
              const fullLead = findLeadById(item.leadId);
              const isContacted = contactedIds.has(item.leadId);

              const priorityBadge =
                item.priorityLevel === "urgent"
                  ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                  : item.priorityLevel === "high"
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                    : "border-sky-500/40 bg-sky-500/15 text-sky-300";

              return (
                <div
                  key={item.leadId || idx}
                  className="rounded-xl border border-border/50 bg-card/80 p-3.5 transition-all duration-150 hover:border-primary/50 hover:bg-card hover:shadow-md"
                >
                  {/* Card Header: Hospital, State, Priority, Value */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider border ${priorityBadge}`}
                      >
                        {item.priorityLevel}
                      </span>
                      <span className="rounded border border-border/50 bg-surface/60 px-1.5 py-0.2 text-[9px] font-bold uppercase text-foreground/80">
                        {item.state}
                      </span>
                      <span className="font-semibold text-xs text-foreground">
                        {item.hospital}
                      </span>
                    </div>

                    {item.estimatedValueUsd ? (
                      <span className="text-xs font-bold tabular-nums text-emerald-400">
                        ${(item.estimatedValueUsd / 1e6).toFixed(1)}M Est.
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Strategic</span>
                    )}
                  </div>

                  {/* Modality & Incumbent */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-medium text-foreground">
                      {item.recommendedModality}
                    </span>
                    {item.incumbentToDisplace && (
                      <span className="rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.2 text-[10px] text-red-300">
                        Displacing: {item.incumbentToDisplace}
                      </span>
                    )}
                  </div>

                  {/* Decision Maker Contact if known */}
                  {item.contactName && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/90">
                        {item.contactName}
                      </span>
                      {item.contactTitle && ` · ${item.contactTitle}`}
                    </div>
                  )}

                  {/* Tactical Pitch Angle */}
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground border-l-2 border-primary/50 pl-2.5">
                    {item.tacticalAngle}
                  </p>

                  {/* Action Triggers */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
                    {onDraftLead && fullLead && (
                      <button
                        onClick={() => onDraftLead(fullLead)}
                        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all duration-150 hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        <span>Draft Outreach</span>
                      </button>
                    )}

                    {onPitchDeckLead && fullLead && (
                      <button
                        onClick={() => onPitchDeckLead(fullLead)}
                        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border/50 bg-surface/60 px-3 py-1.5 text-xs font-medium text-foreground transition-all duration-150 hover:border-primary/40 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Presentation className="h-3.5 w-3.5 text-primary" />
                        <span>Pitch Deck</span>
                      </button>
                    )}

                    {onViewLead && fullLead && (
                      <button
                        onClick={() => onViewLead(fullLead)}
                        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border/50 bg-surface/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-150 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View</span>
                      </button>
                    )}

                    {onToggleContacted && (
                      <button
                        onClick={() => onToggleContacted(item.leadId)}
                        className={`ml-auto flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                          isContacted
                            ? "border border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                            : "border border-border/50 bg-surface/40 text-muted-foreground hover:bg-surface hover:text-foreground"
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
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
    </div>
  );
}
