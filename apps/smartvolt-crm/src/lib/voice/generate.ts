import { transcribe } from "ai";
import { extractVoiceNeeds, voiceLanguage } from "./model";

export function transcriptionModel() {
  const configured = process.env.AI_GATEWAY_TRANSCRIPTION_MODEL;
  if (configured !== undefined)
    return /^[a-z0-9-]+\/[A-Za-z0-9._:-]+$/.test(configured)
      ? configured
      : null;
  // AI SDK 7 routes transcription model IDs through the existing Gateway auth.
  return "elevenlabs/scribe-v2";
}
export async function transcribeVoice(audio: Uint8Array, model: string) {
  const result = await transcribe({
    model,
    audio,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(40000),
    telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
  });
  const text = result.text.trim();
  if (!text || text.length > 12000) throw new Error("voice_transcript_invalid");
  return {
    text,
    language: voiceLanguage(result.language, text),
    extractions: extractVoiceNeeds(text),
  };
}
