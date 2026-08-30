import { describe, it, expect } from "vitest";
import { AesGcmCipher } from "../src/cipher.js";

describe("AesGcmCipher", () => {
  it("round-trips plaintext through encrypt/decrypt", () => {
    const cipher = new AesGcmCipher(AesGcmCipher.generateKey());
    const plaintext = "the user's favorite color is teal";
    const ciphertext = cipher.encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(cipher.decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext on repeated calls (random IV)", () => {
    const cipher = new AesGcmCipher(AesGcmCipher.generateKey());
    const a = cipher.encrypt("same content");
    const b = cipher.encrypt("same content");
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe("same content");
    expect(cipher.decrypt(b)).toBe("same content");
  });

  it("accepts a 64-char hex key and a base64 key equivalently", () => {
    const raw = AesGcmCipher.generateKey();
    const hexCipher = new AesGcmCipher(raw.toString("hex"));
    const b64Cipher = new AesGcmCipher(raw.toString("base64"));
    const ciphertext = hexCipher.encrypt("hello");
    expect(b64Cipher.decrypt(ciphertext)).toBe("hello");
  });

  it("rejects a key that isn't 32 bytes", () => {
    expect(() => new AesGcmCipher(Buffer.from("too short"))).toThrow(/32-byte key/);
  });

  it("fails to decrypt with the wrong key", () => {
    const cipher1 = new AesGcmCipher(AesGcmCipher.generateKey());
    const cipher2 = new AesGcmCipher(AesGcmCipher.generateKey());
    const ciphertext = cipher1.encrypt("secret");
    expect(() => cipher2.decrypt(ciphertext)).toThrow();
  });

  it("fails to decrypt tampered ciphertext", () => {
    const cipher = new AesGcmCipher(AesGcmCipher.generateKey());
    const ciphertext = cipher.encrypt("secret");
    const raw = Buffer.from(ciphertext, "base64");
    raw[raw.length - 1] = (raw[raw.length - 1]! + 1) % 256;
    expect(() => cipher.decrypt(raw.toString("base64"))).toThrow();
  });
});
