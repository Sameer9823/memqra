import { createClient, type RedisClientType } from "redis";
import type { CacheStore } from "@memorie/storage";

export interface RedisCacheStoreOptions {
  /**
   * Every key this store touches is prefixed with this string, so
   * `clear()` only wipes Memorie's own cache entries rather than
   * flushing a Redis database that might be shared with other
   * applications. Defaults to `"memorie:cache:"`.
   */
  keyPrefix?: string;
}

/**
 * Redis-backed CacheStore, using the `redis` (node-redis) client.
 * Values are JSON-serialized. Connects lazily on first use; call
 * `close()` to release the connection when done (tests should always
 * do this to avoid leaking open sockets).
 */
export class RedisCacheStore implements CacheStore {
  private readonly client: RedisClientType;
  private readonly keyPrefix: string;
  private connectPromise: Promise<void> | null = null;

  constructor(urlOrClient: string | RedisClientType, options?: RedisCacheStoreOptions) {
    this.client =
      typeof urlOrClient === "string" ? (createClient({ url: urlOrClient }) as RedisClientType) : urlOrClient;
    this.keyPrefix = options?.keyPrefix ?? "memorie:cache:";
  }

  /** Escape hatch for adapters/tests that need direct client access. */
  get raw(): RedisClientType {
    return this.client;
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.isOpen) return;
    this.connectPromise ??= this.client.connect().then(() => undefined);
    await this.connectPromise;
  }

  private prefixed(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ensureConnected();
    const raw = await this.client.get(this.prefixed(key));
    if (raw === null || raw === undefined) return null;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, options?: { ttlMs?: number }): Promise<void> {
    await this.ensureConnected();
    const serialized = JSON.stringify(value);
    if (options?.ttlMs) {
      await this.client.set(this.prefixed(key), serialized, { PX: options.ttlMs });
    } else {
      await this.client.set(this.prefixed(key), serialized);
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(this.prefixed(key));
  }

  /** Deletes every key under this store's `keyPrefix` (never a full FLUSHDB). */
  async clear(): Promise<void> {
    await this.ensureConnected();
    const pattern = `${this.keyPrefix}*`;
    let cursor = "0";
    do {
      const result = await this.client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await this.client.del(result.keys);
      }
    } while (cursor !== "0");
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
