import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { logInfo, logWarn } from "./logger.server";

export const DEFAULT_ELEVENLABS_AGENT_ID = "agent_0201m72b9x42fw1axsm4hjkynbzf";
export const DEFAULT_ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah (warm, conversational executive voice)

const GEMINI_TTS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";
const GOOGLE_CLOUD_TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

/**
 * Cleans and sanitizes raw LLM markdown into natural, human conversational speech.
 * Preserves natural phrasing and sentence cadence without robotic letter-by-letter
 * hyphenation or repetitive list markers.
 */
export function cleanSpeechScript(raw: string): string {
  if (!raw) return "";

  return (
    raw
      // Remove fenced code blocks (e.g. email draft blocks — summarize instead of reading raw block)
      .replace(/```[\s\S]*?```/g, " I've placed the full personalized email draft on your screen. ")
      // Remove inline code ticks
      .replace(/`([^`]+)`/g, "$1")
      // Convert markdown links [anchor](url) -> anchor
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Strip raw URLs
      .replace(/https?:\/\/[^\s)]+/g, "")
      // Strip markdown headings (# Heading) and ensure sentence break
      .replace(/^#{1,6}\s+(.+)$/gm, "$1.")
      // Remove bold and italic markers
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      // Remove blockquotes (> quote)
      .replace(/^>\s+/gm, "")
      // Convert bullet points into clean sentence breaks
      .replace(/^[\s]*[-*•]\s+/gm, "")
      // Remove numbered list prefixes (1. -> "")
      .replace(/^\d+\.\s+/gm, "")
      // Remove HTML tags
      .replace(/<[^>]+>/g, " ")
      // Naturalize shorthand currency ($1.2M -> $1.2 million, $500k -> $500 thousand)
      .replace(/\$([0-9]+(?:\.[0-9]+)?)\s*M\b/gi, "$$$1 million")
      .replace(/\$([0-9]+(?:\.[0-9]+)?)\s*B\b/gi, "$$$1 billion")
      .replace(/\$([0-9]+(?:\.[0-9]+)?)\s*k\b/gi, "$$$1 thousand")
      // Expand standalone state abbreviations only when surrounded by spaces/punctuation
      .replace(/\bTX\b/g, "Texas")
      .replace(/\bOK\b/g, "Oklahoma")
      .replace(/\bAR\b/g, "Arkansas")
      .replace(/\bLA\b/g, "Louisiana")
      // Naturalize clinical abbreviations without robotic hyphenation
      .replace(/\bPOCUS\b/g, "point-of-care ultrasound")
      .replace(/\bPET\/CT\b/gi, "PET CT")
      .replace(/\bRHTP\b/g, "Rural Health Transformation Program")
      // Collapse multiple spaces and normalize punctuation
      .replace(/\s+/g, " ")
      .replace(/\.\s*\./g, ".")
      .trim()
  );
}

/**
 * Wraps raw 16-bit mono PCM audio bytes (24kHz little-endian from Gemini Native Audio)
 * in a standard 44-byte RIFF WAV header and returns base64.
 */
export function pcm16ToWavBase64(pcmBase64: string, sampleRate = 24000): string {
  const pcmBuffer = Buffer.from(pcmBase64, "base64");
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]).toString("base64");
}

/**
 * Generates an authenticated ElevenLabs Conversational AI signed URL on the server.
 * The ElevenLabsClient reads ELEVENLABS_API_KEY from process.env automatically.
 */
export async function getElevenLabsSignedSession(
  customAgentId?: string,
): Promise<{ signedUrl: string; agentId: string } | null> {
  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    logInfo("elevenlabs.session", "ELEVENLABS_API_KEY not set in environment");
    return null;
  }

  const agentId =
    customAgentId?.trim() ||
    process.env.ELEVENLABS_AGENT_ID?.trim() ||
    DEFAULT_ELEVENLABS_AGENT_ID;

  try {
    const client = new ElevenLabsClient();
    const response = await client.conversationalAi.conversations.getSignedUrl({
      agentId,
    });
    if (response?.signedUrl) {
      return {
        signedUrl: response.signedUrl,
        agentId,
      };
    }
  } catch (err) {
    logWarn("elevenlabs.session", "Failed to get signed URL for agent", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

/**
 * Synthesizes natural conversational speech via ElevenLabs Flash v2.5 (`@elevenlabs/elevenlabs-js`).
 * Reads ELEVENLABS_API_KEY automatically from process.env.
 */
export async function synthesizeSpeechElevenLabs(
  scriptText: string,
  voiceId = DEFAULT_ELEVENLABS_VOICE_ID,
): Promise<string | null> {
  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    return null;
  }

  const cleanedText = cleanSpeechScript(scriptText);
  if (!cleanedText) {
    return null;
  }

  try {
    const client = new ElevenLabsClient();
    const audioStream = await client.textToSpeech.convert(voiceId, {
      text: cleanedText,
      modelId: "eleven_flash_v2_5",
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.8,
      },
    });

    const arrayBuffer = await new Response(audioStream as unknown as ReadableStream).arrayBuffer();
    if (arrayBuffer.byteLength > 0) {
      return Buffer.from(arrayBuffer).toString("base64");
    }
  } catch (err) {
    logWarn("elevenlabs.tts", "ElevenLabs TTS failed, falling back to secondary voice engine", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

/**
 * Synthesizes natural conversational speech using:
 * 0. ElevenLabs Flash v2.5 Neural TTS (`@elevenlabs/elevenlabs-js`) when `ELEVENLABS_API_KEY` is present.
 * 1. Gemini 2.5 Flash Native Audio TTS (`generativelanguage.googleapis.com`) with the warm, executive Aoede voice.
 * 2. Google Cloud Neural2/Journey TTS (`texttospeech.googleapis.com`) with en-US-Journey-F.
 * 3. Returns `null` if no key is configured or credits are depleted, triggering enhanced client-side neural voice selection.
 */
export async function synthesizeSpeechGoogleCloud(
  scriptText: string,
  customApiKey?: string,
): Promise<string | null> {
  const cleanedText = cleanSpeechScript(scriptText);
  if (!cleanedText) {
    return null;
  }

  // Tier 0: ElevenLabs Neural TTS (when ELEVENLABS_API_KEY is configured in environment)
  if (process.env.ELEVENLABS_API_KEY?.trim()) {
    const elevenLabsAudio = await synthesizeSpeechElevenLabs(cleanedText);
    if (elevenLabsAudio) {
      return elevenLabsAudio;
    }
  }

  const apiKey =
    customApiKey?.trim() ||
    process.env.GOOGLE_CLOUD_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) {
    logInfo("tts.synthesize", "Google Cloud / Gemini API key not configured; using client speech fallback");
    return null;
  }

  // Tier 1: Gemini 2.5 Flash Native Audio TTS with Aoede voice (warm, natural human prosody)
  try {
    const geminiRes = await fetch(`${GEMINI_TTS_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Speak in a warm, natural, conversational, intelligent executive tone as Mike's Philips Sales Copilot:\n\n${cleanedText}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede",
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (geminiRes.ok) {
      const geminiJson = (await geminiRes.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { mimeType?: string; data?: string };
            }>;
          };
        }>;
      };
      const inlineData = geminiJson.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineData?.data) {
        const mime = inlineData.mimeType?.toLowerCase() ?? "";
        if (mime.includes("pcm") || mime.includes("l16")) {
          return pcm16ToWavBase64(inlineData.data, 24000);
        }
        return inlineData.data;
      }
    } else if (geminiRes.status === 402) {
      logWarn("tts.synthesize", "Gemini API key returned 402: credits depleted in Google AI Studio project");
    }
  } catch (err) {
    logWarn("tts.synthesize", "Gemini native TTS unavailable, trying Cloud TTS fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Tier 2: Google Cloud Text-to-Speech API (Journey en-US-Journey-F)
  try {
    const response = await fetch(`${GOOGLE_CLOUD_TTS_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: cleanedText },
        voice: {
          languageCode: "en-US",
          name: "en-US-Journey-F",
          ssmlGender: "FEMALE",
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1.0,
          pitch: 0.0,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      const data = (await response.json()) as { audioContent?: string };
      if (data.audioContent) {
        return data.audioContent;
      }
    }
  } catch (err) {
    logWarn("tts.synthesize", "Exception calling Google Cloud TTS, falling back to Web Speech", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}
