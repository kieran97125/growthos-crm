import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { parseBuffer } from "music-metadata";
import {
  MEDIA_MAX_BYTES,
  MEDIA_MIME_TYPES,
  mediaLimit,
  type MediaKind,
} from "./model";

export class MediaBytesError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function providerMediaUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new MediaBytesError("media_url_invalid");
  }
  const h = u.hostname.toLowerCase();
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.hash ||
    !(
      h === "lookaside.fbsbx.com" ||
      h === "cdn.fbsbx.com" ||
      h.endsWith(".fbcdn.net")
    )
  )
    throw new MediaBytesError("media_url_invalid");
  return u;
}
export async function boundedMedia(
  response: Response,
  limit = MEDIA_MAX_BYTES,
) {
  if (!response.ok)
    throw new MediaBytesError(
      response.status === 404 || response.status === 410
        ? "media_expired"
        : "media_unavailable",
    );
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body?.cancel();
    throw new MediaBytesError("media_too_large");
  }
  if (!response.body) throw new MediaBytesError("media_empty");
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
        throw new MediaBytesError("media_too_large");
      }
      chunks.push(p.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new MediaBytesError("media_empty");
  return new Uint8Array(Buffer.concat(chunks));
}
export async function inspectMedia(bytes: Uint8Array) {
  if (!bytes.length) throw new MediaBytesError("media_empty");
  if (bytes.length > MEDIA_MAX_BYTES)
    throw new MediaBytesError("media_too_large");
  let detected;
  try {
    detected = await fileTypeFromBuffer(bytes, {
      maxBufferSize: 1024 * 1024,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new MediaBytesError("media_format");
  }
  if (!detected) throw new MediaBytesError("media_format");
  let mimeType = detected.mime === "audio/x-m4a" ? "audio/mp4" : detected.mime;
  if (!(MEDIA_MIME_TYPES as readonly string[]).includes(mimeType))
    throw new MediaBytesError("media_format");
  const kind: MediaKind = mimeType.startsWith("image/")
    ? "image"
    : mimeType.startsWith("video/")
      ? "video"
      : mimeType.startsWith("audio/")
        ? "audio"
        : "document";
  if (bytes.length > mediaLimit(kind))
    throw new MediaBytesError("media_too_large");
  // The BMFF signature alone cannot distinguish an audio-only m4a from a video.
  // Confirm container metadata and actual audio duration before accepting audio.
  if (kind === "audio") {
    let metadata;
    try {
      metadata = await parseBuffer(
        bytes,
        { mimeType, size: bytes.length },
        { duration: true, skipCovers: true },
      );
    } catch {
      throw new MediaBytesError("media_format");
    }
    if (
      !metadata.format.duration ||
      !Number.isFinite(metadata.format.duration) ||
      metadata.format.duration <= 0 ||
      metadata.format.duration > 1800
    )
      throw new MediaBytesError("media_duration");
    if (
      mimeType === "audio/ogg" &&
      metadata.format.codec &&
      !/opus/i.test(metadata.format.codec)
    )
      throw new MediaBytesError("media_audio_codec");
    if (mimeType === "audio/x-m4a") mimeType = "audio/mp4";
  }
  return {
    kind,
    mimeType,
    bytes: bytes.length,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    extension: detected.ext,
  };
}
export async function fetchProviderMedia(
  url: string,
  token?: string,
  fetcher: typeof fetch = fetch,
) {
  return boundedMedia(
    await fetcher(providerMediaUrl(url), {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
      headers: token ? { Authorization: "Bearer " + token } : {},
    }),
  );
}
export async function whatsappMediaMetadata(
  id: string,
  token: string,
  version: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^[1-9]\d{0,49}$/.test(id) || !/^v[1-9]\d{0,2}\.\d{1,2}$/.test(version))
    throw new MediaBytesError("media_unavailable");
  const raw = await boundedMedia(
    await fetcher(`https://graph.facebook.com/${version}/${id}`, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    }),
    65536,
  );
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    throw new MediaBytesError("media_unavailable");
  }
  if (m.id !== id || typeof m.url !== "string")
    throw new MediaBytesError("media_unavailable");
  providerMediaUrl(m.url);
  if (typeof m.file_size === "number" && m.file_size > MEDIA_MAX_BYTES)
    throw new MediaBytesError("media_too_large");
  return { url: m.url, hash: typeof m.sha256 === "string" ? m.sha256 : null };
}
