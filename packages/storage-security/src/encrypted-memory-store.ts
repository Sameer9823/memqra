import type { Memory, ListOptions, CountOptions } from "@memorie/types";
import type { MemoryStore } from "@memorie/storage";
import type { Cipher } from "./cipher.js";

export interface EncryptedMemoryStoreOptions {
  cipher: Cipher;
}

/**
 * A MemoryStore decorator that transparently encrypts `content` at rest,
 * wrapping any existing MemoryStore adapter (SQLite, Postgres, in-memory,
 * a future MongoDB/MySQL adapter, ...) without that adapter needing to
 * know anything about encryption:
 *
 * ```ts
 * const memoryStore = new EncryptedMemoryStore(new PostgresMemoryStore(pool), {
 *   cipher: new AesGcmCipher(process.env.MEMORIE_ENCRYPTION_KEY!),
 * });
 * const engine = createMemoryEngine({ memoryStore });
 * ```
 *
 * `content` is ciphertext in whatever the wrapped store persists to disk,
 * but every method here still returns plaintext `Memory` objects — the
 * engine, `SearchStore.index()`, `VectorStore`/`EmbeddingProvider`, and
 * anything else built against the plain `MemoryStore` contract keeps
 * working unmodified; only what physically reaches the underlying
 * storage engine is encrypted (docs/SECURITY.md).
 *
 * Only `content` is encrypted — the field docs/SECURITY.md calls out as
 * stored in plaintext today. `metadata` is left as-is, since it's used
 * for structured filtering (`list()`/`count()`/keyword search) by
 * several adapters and encrypting it would break that. Put anything in
 * `metadata` that needs the same protection into `content` instead, or
 * encrypt it yourself before it reaches the engine.
 *
 * Wrapping a `TransactionalMemoryStore` loses `transaction()` — this
 * decorator implements the plain `MemoryStore` surface only.
 */
export class EncryptedMemoryStore implements MemoryStore {
  private readonly inner: MemoryStore;
  private readonly cipher: Cipher;

  constructor(inner: MemoryStore, options: EncryptedMemoryStoreOptions) {
    this.inner = inner;
    this.cipher = options.cipher;
  }

  private toCiphertext(memory: Memory): Memory {
    return { ...memory, content: this.cipher.encrypt(memory.content) };
  }

  private toPlaintext(memory: Memory): Memory {
    return { ...memory, content: this.cipher.decrypt(memory.content) };
  }

  private encryptPatch(patch: Partial<Memory>): Partial<Memory> {
    return patch.content === undefined ? patch : { ...patch, content: this.cipher.encrypt(patch.content) };
  }

  async create(memory: Memory): Promise<Memory> {
    const stored = await this.inner.create(this.toCiphertext(memory));
    // Return the plaintext we already have rather than re-decrypting —
    // avoids a redundant decrypt and sidesteps any encoding round-trip
    // quirks in whatever the underlying store echoed back.
    return { ...stored, content: memory.content };
  }

  async get(id: string): Promise<Memory | null> {
    const stored = await this.inner.get(id);
    return stored ? this.toPlaintext(stored) : null;
  }

  async update(
    id: string,
    patch: Partial<Memory>,
    options?: { expectedVersion?: number },
  ): Promise<Memory> {
    const stored = await this.inner.update(id, this.encryptPatch(patch), options);
    return this.toPlaintext(stored);
  }

  delete(id: string): Promise<void> {
    return this.inner.delete(id);
  }

  async list(options?: ListOptions): Promise<Memory[]> {
    const stored = await this.inner.list(options);
    return stored.map((m) => this.toPlaintext(m));
  }

  count(options?: CountOptions): Promise<number> {
    // content isn't involved in counting; nothing to decrypt.
    return this.inner.count(options);
  }

  async createMany(memories: Memory[]): Promise<Memory[]> {
    if (!this.inner.createMany) {
      return Promise.all(memories.map((m) => this.create(m)));
    }
    const stored = await this.inner.createMany(memories.map((m) => this.toCiphertext(m)));
    return stored.map((s, i) => ({ ...s, content: memories[i]!.content }));
  }

  async updateMany(
    updates: Array<{ id: string; patch: Partial<Memory>; expectedVersion?: number }>,
  ): Promise<Memory[]> {
    if (!this.inner.updateMany) {
      return Promise.all(updates.map((u) => this.update(u.id, u.patch, { expectedVersion: u.expectedVersion })));
    }
    const encrypted = updates.map((u) => ({ ...u, patch: this.encryptPatch(u.patch) }));
    const stored = await this.inner.updateMany(encrypted);
    return stored.map((s) => this.toPlaintext(s));
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (!this.inner.deleteMany) {
      await Promise.all(ids.map((id) => this.delete(id)));
      return;
    }
    await this.inner.deleteMany(ids);
  }
}
