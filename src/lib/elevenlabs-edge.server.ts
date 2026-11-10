/**
 * Edge-compatible ElevenLabsClient implementation for Cloudflare Workers / Vite SSR bundling.
 * Reads ELEVENLABS_API_KEY from process.env automatically (never hardcoded).
 */
export interface ElevenLabsClientOptions {
  apiKey?: string;
}

export class ElevenLabsClient {
  private readonly apiKey: string;

  constructor(options?: ElevenLabsClientOptions) {
    this.apiKey = options?.apiKey ?? process.env.ELEVENLABS_API_KEY ?? "";
  }

  public readonly conversationalAi = {
    conversations: {
      getSignedUrl: async ({
        agentId,
      }: {
        agentId: string;
      }): Promise<{ signedUrl: string }> => {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
          {
            method: "GET",
            headers: {
              "xi-api-key": this.apiKey,
            },
          },
        );
        if (!res.ok) {
          throw new Error(`ElevenLabs getSignedUrl HTTP ${res.status}`);
        }
        const data = (await res.json()) as { signed_url?: string; signedUrl?: string };
        return {
          signedUrl: data.signed_url ?? data.signedUrl ?? "",
        };
      },
    },
  };

  public readonly textToSpeech = {
    convert: async (
      voiceId: string,
      options: {
        text: string;
        modelId?: string;
        voiceSettings?: {
          stability?: number;
          similarityBoost?: number;
        };
      },
    ): Promise<ReadableStream<Uint8Array>> => {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: options.text,
            model_id: options.modelId ?? "eleven_flash_v2_5",
            voice_settings: options.voiceSettings
              ? {
                  stability: options.voiceSettings.stability ?? 0.5,
                  similarity_boost: options.voiceSettings.similarityBoost ?? 0.8,
                }
              : undefined,
          }),
        },
      );
      if (!res.ok || !res.body) {
        throw new Error(`ElevenLabs textToSpeech HTTP ${res.status}`);
      }
      return res.body;
    },
  };
}
