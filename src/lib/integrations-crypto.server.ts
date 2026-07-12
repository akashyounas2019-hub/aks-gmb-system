import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM encryption for user-provided integration credentials.
// Ciphertext format (base64): v1:<iv>:<tag>:<ct>
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw) throw new Error("INTEGRATIONS_ENCRYPTION_KEY is not set");
  // Derive a stable 32-byte key from the secret regardless of its length/encoding.
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid ciphertext");
  }
  const key = getKey();
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

export function maskValue(v: string): string {
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}
