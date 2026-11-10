import { logInfo, logWarn } from "./logger.server";

const GOOGLE_TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

/**
 * Cleans and sanitizes raw LLM output into human-like executive spoken text.
 * Eliminates markdown formatting, raw URLs, asterisks, hashes, and brackets
 * that would degrade speech synthesis quality.
 */
export function cleanSpeechScript(raw: string): string {
  if (!raw) return "";

  return (
    raw
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, " ")
      // Remove inline code
      .replace(/`([^`]+)`/g, "$1")
      // Remove markdown links [anchor](url) -> anchor
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove raw URLs
      .replace(/https?:\/\/[^\s)]+/g, "")
      // Remove markdown headings (# Heading)
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold and italic markers
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      // Remove blockquotes (> quote)
      .replace(/^>\s+/gm, "")
      // Convert bullet points to natural speech pauses
      .replace(/^[\s]*[-*•]\s+/gm, "Next, ")
      // Remove numbered list prefixes
      .replace(/^\d+\.\s+/gm, "")
      // Remove HTML tags
      .replace(/<[^>]+>/g, " ")
      // Naturalize currency: $1.2M -> 1.2 million dollars, $500k -> 500 thousand dollars
      .replace(/\$([0-9]+(?:\.[0-9]+)?)\s*M\b/gi, "$1 million dollars")
      .replace(/\$([0-9]+(?:\.[0-9]+)?)\s*k\b/gi, "$1 thousand dollars")
      .replace(/\$([0-9,]+)/g, "$1 dollars")
      // Naturalize state codes in speech when standalone
      .replace(/\bTX\b/g, "Texas")
      .replace(/\bOK\b/g, "Oklahoma")
      .replace(/\bAR\b/g, "Arkansas")
      .replace(/\bLA\b/g, "Louisiana")
      // Naturalize common medical imaging abbreviations
      .replace(/\bPOCUS\b/g, "point of care ultrasound")
      .replace(/\bPET\/CT\b/gi, "P-E-T C-T")
      .replace(/\bRHTP?\b/g, "Rural Health Transformation")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Calls Google Cloud Text-to-Speech API to synthesize an MP3 audio stream.
 * Returns the base64-encoded audio content, or null if API key is not configured
 * or if upstream synthesis fails (triggering zero-downtime client Web Speech fallback).
 */
export async function synthesizeSpeechGoogleCloud(scriptText: string): Promise<string | null> {
  const apiKey =
    process.env.GOOGLE_CLOUD_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) {
    logInfo("tts.synthesize", "Google Cloud API key not configured; using Web Speech API fallback");
    return null;
  }

  const cleanedText = cleanSpeechScript(scriptText);
  if (!cleanedText) {
    return null;
  }

  try {
    const response = await fetch(`${GOOGLE_TTS_ENDPOINT}?key=${apiKey}`, {
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
          speakingRate: 1.05,
          pitch: 0.0,
        },
      }),
    });

    if (!response.ok) {
      // If Journey voice is unavailable in the region, try standard Neural2
      if (response.status === 400 || response.status === 404) {
        logWarn("tts.synthesize", "Primary Journey voice unavailable, trying Neural2 fallback", {
          status: response.status,
        });
        const retryRes = await fetch(`${GOOGLE_TTS_ENDPOINT}?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text: cleanedText },
            voice: {
              languageCode: "en-US",
              name: "en-US-Neural2-F",
              ssmlGender: "FEMALE",
            },
            audioConfig: {
              audioEncoding: "MP3",
              speakingRate: 1.05,
            },
          }),
        });

        if (retryRes.ok) {
          const retryData = (await retryRes.json()) as { audioContent?: string };
          if (retryData.audioContent) {
            return retryData.audioContent;
          }
        }
      }

      const errText = await response.text().catch(() => "");
      logWarn("tts.synthesize", "Google Cloud TTS returned non-200, falling back to Web Speech", {
        status: response.status,
        error: errText.slice(0, 200),
      });
      return null;
    }

    const data = (await response.json()) as { audioContent?: string };
    if (!data.audioContent) {
      logWarn("tts.synthesize", "Google Cloud TTS response lacked audioContent");
      return null;
    }

    return data.audioContent;
  } catch (err) {
    logWarn("tts.synthesize", "Exception calling Google Cloud TTS, falling back to Web Speech", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
