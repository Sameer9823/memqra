import type {
  Memory,
  ListOptions,
  CountOptions,
} from "@memorie/types";

/**
 * A MemoryStore holds canonical memory records. It is the only
 * authoritative store in a Memorie deployment (see docs/ARCHITECTURE.md).
 * Vector/search/graph/cache stores are projections that can always be
 * rebuilt from this one.
 */
export interface MemoryStore {
  create(memory: Memory): Promise<Memory>;

  get(id: string): Promise<Memory | null>;

  /**
   * Partially update a memory. If `expectedVersion` is provided and does
   * not match the stored version, implementations MUST throw
   * VersionConflictError instead of applying the patch.
   */
  update(
    id: string,
    patch: Partial<Memory>,
    options?: { expectedVersion?: number },
  ): Promise<Memory>;

  delete(id: string): Promise<void>;

  list(options?: ListOptions): Promise<Memory[]>;

  count(options?: CountOptions): Promise<number>;

  /** Bulk variants. Implementations should use native bulk operations where available. */
  createMany?(memories: Memory[]): Promise<Memory[]>;
  updateMany?(
    updates: Array<{ id: string; patch: Partial<Memory>; expectedVersion?: number }>,
  ): Promise<Memory[]>;
  deleteMany?(ids: string[]): Promise<void>;
}

/** Marker interface: stores that can participate in a MemoryStore.transaction(). */
export interface TransactionalMemoryStore extends MemoryStore {
  transaction<T>(fn: (tx: MemoryStore) => Promise<T>): Promise<T>;
}

export function isTransactional(
  store: MemoryStore,
): store is TransactionalMemoryStore {
  return typeof (store as TransactionalMemoryStore).transaction === "function";
}
