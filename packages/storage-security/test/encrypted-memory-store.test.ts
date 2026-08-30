import { describe, it, expect } from "vitest";
import { InMemoryStore } from "@memorie/storage-memory";
import type { Memory } from "@memorie/types";
import { AesGcmCipher } from "../src/cipher.js";
import { EncryptedMemoryStore } from "../src/encrypted-memory-store.js";

function newMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date();
  return {
    id: overrides.id ?? crypto.randomUUID(),
    namespace: "users",
    subjectId: "u1",
    type: "fact",
    content: "the secret ingredient is nutmeg",
    state: "active",
    importance: 0.5,
    confidence: 0.5,
    metadata: { visibility: "private" },
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    expiresAt: null,
    version: 1,
    ...overrides,
  };
}

describe("EncryptedMemoryStore", () => {
  it("stores ciphertext in the wrapped store but returns plaintext to callers", async () => {
    const inner = new InMemoryStore();
    const cipher = new AesGcmCipher(AesGcmCipher.generateKey());
    const store = new EncryptedMemoryStore(inner, { cipher });

    const memory = newMemory();
    const created = await store.create(memory);
    expect(created.content).toBe(memory.content);

    // The wrapped store physically holds ciphertext, not the plaintext.
    const rawFromInner = await inner.get(memory.id);
    expect(rawFromInner?.content).not.toBe(memory.content);
    expect(typeof rawFromInner?.content).toBe("string");
    expect(cipher.decrypt(rawFromInner!.content)).toBe(memory.content);

    // Reading back through the decorator yields plaintext again.
    const fetched = await store.get(memory.id);
    expect(fetched?.content).toBe(memory.content);
  });

  it("leaves metadata untouched (only content is encrypted)", async () => {
    const inner = new InMemoryStore();
    const cipher = new AesGcmCipher(AesGcmCipher.generateKey());
    const store = new EncryptedMemoryStore(inner, { cipher });

    const memory = newMemory({ metadata: { tag: "important" } });
    await store.create(memory);
    const rawFromInner = await inner.get(memory.id);
    expect(rawFromInner?.metadata).toEqual({ tag: "important" });
  });

  it("encrypts a content patch on update() and returns plaintext", async () => {
    const inner = new InMemoryStore();
    const cipher = new AesGcmCipher(AesGcmCipher.generateKey());
    const store = new EncryptedMemoryStore(inner, { cipher });

    const memory = newMemory();
    await store.create(memory);
    const updated = await store.update(memory.id, { content: "updated secret" });
    expect(updated.content).toBe("updated secret");

    const rawFromInner = await inner.get(memory.id);
    expect(rawFromInner?.content).not.toBe("updated secret");
    expect(cipher.decrypt(rawFromInner!.content)).toBe("updated secret");
  });

  it("decrypts every memory returned by list()", async () => {
    const inner = new InMemoryStore();
    const cipher = new AesGcmCipher(AesGcmCipher.generateKey());
    const store = new EncryptedMemoryStore(inner, { cipher });

    await store.create(newMemory({ id: "m1", content: "first" }));
    await store.create(newMemory({ id: "m2", content: "second" }));

    const listed = await store.list({ namespace: "users", subjectId: "u1" });
    const contents = listed.map((m) => m.content).sort();
    expect(contents).toEqual(["first", "second"]);
  });

  it("falls back to per-item create/update/delete when the wrapped store has no bulk methods", async () => {
    // InMemoryStore doesn't implement createMany/updateMany/deleteMany,
    // so this exercises EncryptedMemoryStore's fallback path.
    const inner = new InMemoryStore();
    const cipher = new AesGcmCipher(AesGcmCipher.generateKey());
    const store = new EncryptedMemoryStore(inner, { cipher });

    const created = await store.createMany([
      newMemory({ id: "b1", content: "bulk one" }),
      newMemory({ id: "b2", content: "bulk two" }),
    ]);
    expect(created.map((m) => m.content).sort()).toEqual(["bulk one", "bulk two"]);

    const updated = await store.updateMany([{ id: "b1", patch: { content: "bulk one updated" } }]);
    expect(updated[0]?.content).toBe("bulk one updated");

    await store.deleteMany(["b1", "b2"]);
    expect(await store.get("b1")).toBeNull();
    expect(await store.get("b2")).toBeNull();
  });
});
