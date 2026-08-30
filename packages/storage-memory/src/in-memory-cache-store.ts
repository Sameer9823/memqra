import type { CacheStore } from "@memorie/storage";

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

export class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, Entry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, options?: { ttlMs?: number }): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: options?.ttlMs ? Date.now() + options.ttlMs : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}
