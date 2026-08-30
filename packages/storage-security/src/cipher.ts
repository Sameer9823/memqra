import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * A minimal, provider-independent encryption facade — the encryption-at-rest
 * counterpart to Logger/MetricsProvider/Tracer/RedactFn. `EncryptedMemoryStore`
 * (encrypted-memory-store.ts) depends only on this interface, so a KMS-backed,
 * HSM-backed, or otherwise-managed-key implementation can be swapped in
 * without changing the store decorator.
 */
export interface Cipher {
  /** Encrypts plaintext, returning an opaque string safe to persist. */
  encrypt(plaintext: string): string;
  /** Reverses encrypt(). Throws if `ciphertext` was tampered with or wasn't produced by this cipher/key. */
  decrypt(ciphertext: string): string;
}

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // bytes, for AES-256
const IV_LENGTH = 12; // bytes, the recommended GCM nonce size
const TAG_LENGTH = 16; // bytes, the standard GCM auth tag size

/**
 * AES-256-GCM Cipher built on Node's built-in `node:crypto` — no external
 * dependency, so it works in this sandbox and in any Node runtime.
 *
 * Encodes each ciphertext as base64(iv || authTag || encryptedBytes), so
 * every encrypt() call is self-contained (a fresh random IV per call) and
 * every decrypt() call both decrypts and authenticates in one step —
 * decrypt() throws if the ciphertext was truncated, corrupted, or produced
 * with a different key, rather than silently returning garbage.
 */
export class AesGcmCipher implements Cipher {
  private readonly key: Buffer;

  /**
   * @param key A 32-byte AES-256 key, as a raw Buffer, a 64-character hex
   *   string, or a base64 string that decodes to exactly 32 bytes. Use
   *   `AesGcmCipher.generateKey()` to create one; store it outside your
   *   application code (a secrets manager / KMS / env var), never alongside
   *   the encrypted data it protects.
   */
  constructor(key: Buffer | string) {
    this.key = normalizeKey(key);
    if (this.key.length !== KEY_LENGTH) {
      throw new Error(
        `AesGcmCipher requires a ${KEY_LENGTH}-byte key, got ${this.key.length} bytes. ` +
          "Use AesGcmCipher.generateKey() to create a valid one.",
      );
    }
  }

  /** Generates a fresh, cryptographically random 32-byte key suitable for AesGcmCipher. */
  static generateKey(): Buffer {
    return randomBytes(KEY_LENGTH);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  decrypt(ciphertext: string): string {
    const raw = Buffer.from(ciphertext, "base64");
    if (raw.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error("AesGcmCipher.decrypt: ciphertext is too short to be valid");
    }
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  }
}

function normalizeKey(key: Buffer | string): Buffer {
  if (Buffer.isBuffer(key)) return key;
  if (/^[0-9a-fA-F]{64}$/.test(key)) return Buffer.from(key, "hex");
  return Buffer.from(key, "base64");
}
