import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { WaProtocolError } from "./types";

const envelopeSchema = z
  .object({
    version: z.literal(1),
    keyId: z.string().regex(/^[a-f0-9]{16}$/),
    iv: z.string().regex(/^[A-Za-z0-9_-]+$/),
    tag: z.string().regex(/^[A-Za-z0-9_-]+$/),
    ciphertext: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(100_000),
  })
  .strict();
export type EncryptedCredentials = z.infer<typeof envelopeSchema>;

export function readMasterKey(
  value = process.env.SMARTVOLT_WHATSAPP_ENCRYPTION_KEY,
): Buffer {
  if (!value) throw new WaProtocolError("encryption_not_configured");
  const normalized = value.trim();
  const key = Buffer.from(normalized, "base64");
  if (key.length !== 32 || key.toString("base64") !== normalized)
    throw new WaProtocolError("encryption_key_invalid");
  return key;
}

function validatedKey(key: string | Uint8Array): Buffer {
  const bytes = typeof key === "string" ? readMasterKey(key) : Buffer.from(key);
  if (bytes.length !== 32) throw new WaProtocolError("encryption_key_invalid");
  return bytes;
}
export function keyFingerprint(key: string | Uint8Array): string {
  return createHash("sha256")
    .update(validatedKey(key))
    .digest("hex")
    .slice(0, 16);
}
function aad(companyId: string, connectionId: string): Buffer {
  if (
    ![companyId, connectionId].every(
      (id) =>
        typeof id === "string" &&
        id.length > 0 &&
        id.length <= 100 &&
        !/[\u0000-\u001f]/.test(id),
    )
  )
    throw new WaProtocolError("credential_scope_invalid");
  return Buffer.from(
    JSON.stringify([
      "smartvolt-whatsapp-credentials",
      1,
      companyId,
      connectionId,
    ]),
  );
}

export function encryptCredentials(
  value: Record<string, unknown>,
  masterKey: string | Uint8Array,
  companyId: string,
  connectionId: string,
): EncryptedCredentials {
  const key = validatedKey(masterKey);
  let plaintext: string | undefined;
  try {
    plaintext = JSON.stringify(value);
  } catch {
    throw new WaProtocolError("credentials_invalid");
  }
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    typeof plaintext !== "string" ||
    Buffer.byteLength(plaintext) > 65_536
  )
    throw new WaProtocolError("credentials_invalid");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(companyId, connectionId));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    keyId: keyFingerprint(key),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function decryptCredentials(
  value: unknown,
  masterKey: string | Uint8Array,
  companyId: string,
  connectionId: string,
): Record<string, unknown> {
  const key = validatedKey(masterKey);
  const checked = envelopeSchema.safeParse(value);
  if (!checked.success)
    throw new WaProtocolError("credential_envelope_invalid");
  const envelope = checked.data;
  if (envelope.keyId !== keyFingerprint(key))
    throw new WaProtocolError("credential_key_mismatch");
  const iv = Buffer.from(envelope.iv, "base64url"),
    tag = Buffer.from(envelope.tag, "base64url");
  if (iv.length !== 12 || tag.length !== 16)
    throw new WaProtocolError("credential_envelope_invalid");
  const associated = aad(companyId, connectionId);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(associated);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]);
    const result: unknown = JSON.parse(plaintext.toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result as Record<string, unknown>;
  } catch {
    throw new WaProtocolError("credential_decryption_failed");
  }
}
