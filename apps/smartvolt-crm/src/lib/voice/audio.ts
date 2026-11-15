import { createHash } from "node:crypto";
import { parseBuffer } from "music-metadata";
import { DEFAULT_GRAPH_VERSION } from "../whatsapp/graph";
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from "./constants";

export class VoiceMediaError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function mediaUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new VoiceMediaError("audio_url_invalid");
  }
  const h = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !(
      h === "lookaside.fbsbx.com" ||
      h === "cdn.fbsbx.com" ||
      h.endsWith(".fbcdn.net")
    )
  )
    throw new VoiceMediaError("audio_url_invalid");
  return url;
}
export async function boundedAudio(
  response: Response,
  limit = VOICE_MAX_BYTES,
): Promise<Uint8Array> {
  if (!response.ok)
    throw new VoiceMediaError(
      response.status === 404 || response.status === 410
        ? "audio_expired"
        : "audio_unavailable",
    );
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel();
    throw new VoiceMediaError("audio_too_large");
  }
  if (!response.body) throw new VoiceMediaError("audio_missing");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const p = await reader.read();
      if (p.done) break;
      total += p.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new VoiceMediaError("audio_too_large");
      }
      chunks.push(p.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new VoiceMediaError("audio_missing");
  return new Uint8Array(Buffer.concat(chunks));
}
export function sniffAudio(bytes: Uint8Array): string {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 4).toString() === "OggS") return "audio/ogg";
  if (
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WAVE"
  )
    return "audio/wav";
  if (b.subarray(0, 4).toString() === "fLaC") return "audio/flac";
  if (b.subarray(4, 8).toString() === "ftyp") return "audio/mp4";
  if (
    b.subarray(0, 3).toString() === "ID3" ||
    (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
  )
    return "audio/mpeg";
  if (b.length > 4 && b.readUInt32BE(0) === 0x1a45dfa3) return "audio/webm";
  throw new VoiceMediaError("audio_format");
}
export async function inspectAudio(bytes: Uint8Array) {
  if (!bytes.length) throw new VoiceMediaError("audio_missing");
  if (bytes.length > VOICE_MAX_BYTES)
    throw new VoiceMediaError("audio_too_large");
  const mimeType = sniffAudio(bytes);
  let meta;
  try {
    meta = await parseBuffer(
      bytes,
      { mimeType, size: bytes.length },
      { duration: true, skipCovers: true },
    );
  } catch {
    throw new VoiceMediaError("audio_format");
  }
  const durationSeconds = meta.format.duration;
  if (
    !durationSeconds ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  )
    throw new VoiceMediaError("audio_duration_unknown");
  if (durationSeconds > VOICE_MAX_SECONDS)
    throw new VoiceMediaError("audio_too_long");
  return {
    mimeType,
    durationSeconds,
    audioBytes: bytes.length,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
  };
}
export async function downloadProviderAudio(
  url: string,
  token?: string,
  fetcher: typeof fetch = fetch,
) {
  const checked = mediaUrl(url);
  return boundedAudio(
    await fetcher(checked, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: token ? { Authorization: "Bearer " + token } : {},
    }),
  );
}
export async function whatsappAudioMetadata(
  mediaId: string,
  token: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^[1-9]\d{0,49}$/.test(mediaId))
    throw new VoiceMediaError("audio_missing");
  const version =
    process.env.SMARTVOLT_WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  // Use the same configured version and bounded version format as WhatsApp replies.
  if (!/^v[1-9]\d{0,2}\.\d{1,2}$/.test(version) || /\s/.test(version))
    throw new VoiceMediaError("audio_unavailable");
  const response = await fetcher(
    "https://graph.facebook.com/" + version + "/" + mediaId,
    {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  const data = JSON.parse(
    new TextDecoder().decode(await boundedAudio(response, 65536)),
  ) as Record<string, unknown>;
  if (data.id !== mediaId || typeof data.url !== "string")
    throw new VoiceMediaError("audio_missing");
  mediaUrl(data.url);
  if (typeof data.file_size === "number" && data.file_size > VOICE_MAX_BYTES)
    throw new VoiceMediaError("audio_too_large");
  return {
    url: data.url,
    sha256: typeof data.sha256 === "string" ? data.sha256 : null,
  };
}
