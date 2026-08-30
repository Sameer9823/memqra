import type { MemoryStore } from "@memorie/storage";
import type {
  Memory,
  ListOptions,
  CountOptions,
  MemoryFilters,
} from "@memorie/types";
import { MemoryNotFoundError, VersionConflictError } from "@memorie/types";

function matchesRange(
  value: number | Date | undefined,
  range: { eq?: unknown; gte?: unknown; gt?: unknown; lte?: unknown; lt?: unknown } | undefined,
): boolean {
  if (!range || value === undefined) return true;
  const v = value instanceof Date ? value.getTime() : value;
  const num = (x: unknown): number => (x instanceof Date ? x.getTime() : (x as number));
  if (range.eq !== undefined && v !== num(range.eq)) return false;
  if (range.gte !== undefined && v < num(range.gte)) return false;
  if (range.gt !== undefined && v <= num(range.gt)) return false;
  if (range.lte !== undefined && v > num(range.lte)) return false;
  if (range.lt !== undefined && v >= num(range.lt)) return false;
  return true;
}

function matchesFilters(memory: Memory, filters?: MemoryFilters): boolean {
  if (!filters) return true;
  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    if (!types.includes(memory.type)) return false;
  }
  if (filters.state) {
    const states = Array.isArray(filters.state) ? filters.state : [filters.state];
    if (!states.includes(memory.state)) return false;
  }
  if (!matchesRange(memory.importance, filters.importance)) return false;
  if (!matchesRange(memory.confidence, filters.confidence)) return false;
  if (!matchesRange(memory.createdAt, filters.createdAt)) return false;
  if (!matchesRange(memory.updatedAt, filters.updatedAt)) return false;
  if (filters.metadata) {
    for (const [key, value] of Object.entries(filters.metadata)) {
      if (memory.metadata[key] !== value) return false;
    }
  }
  return true;
}

function matchesScope(
  memory: Memory,
  scope: { tenantId?: string; namespace?: string; subjectId?: string },
): boolean {
  if (scope.tenantId !== undefined && memory.tenantId !== scope.tenantId) return false;
  if (scope.namespace !== undefined && memory.namespace !== scope.namespace) return false;
  if (scope.subjectId !== undefined && memory.subjectId !== scope.subjectId) return false;
  return true;
}

/**
 * Simple in-memory MemoryStore. Not persistent; primarily intended for
 * tests, local prototyping, and as a reference implementation of the
 * MemoryStore contract.
 */
export class InMemoryStore implements MemoryStore {
  private readonly records = new Map<string, Memory>();

  async create(memory: Memory): Promise<Memory> {
    const clone = structuredClone(memory);
    this.records.set(clone.id, clone);
    return structuredClone(clone);
  }

  async get(id: string): Promise<Memory | null> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  async update(
    id: string,
    patch: Partial<Memory>,
    options?: { expectedVersion?: number },
  ): Promise<Memory> {
    const existing = this.records.get(id);
    if (!existing) {
      throw new MemoryNotFoundError(id);
    }
    if (
      options?.expectedVersion !== undefined &&
      existing.version !== options.expectedVersion
    ) {
      throw new VersionConflictError(id, options.expectedVersion, existing.version);
    }
    const updated: Memory = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
    };
    this.records.set(id, updated);
    return structuredClone(updated);
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  async list(options: ListOptions = {}): Promise<Memory[]> {
    let results = [...this.records.values()].filter(
      (m) => matchesScope(m, options) && matchesFilters(m, options.filters),
    );

    const orderBy = options.orderBy ?? "createdAt";
    const direction = options.orderDirection ?? "asc";
    results = results.sort((a, b) => {
      const av = a[orderBy] instanceof Date ? (a[orderBy] as Date).getTime() : (a[orderBy] as number);
      const bv = b[orderBy] instanceof Date ? (b[orderBy] as Date).getTime() : (b[orderBy] as number);
      return direction === "asc" ? av - bv : bv - av;
    });

    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    return results.slice(offset, offset + limit).map((m) => structuredClone(m));
  }

  async count(options: CountOptions = {}): Promise<number> {
    return [...this.records.values()].filter(
      (m) => matchesScope(m, options) && matchesFilters(m, options.filters),
    ).length;
  }

  async createMany(memories: Memory[]): Promise<Memory[]> {
    return Promise.all(memories.map((m) => this.create(m)));
  }

  async deleteMany(ids: string[]): Promise<void> {
    for (const id of ids) this.records.delete(id);
  }

  /** Test/debug helper. Not part of the MemoryStore contract. */
  clear(): void {
    this.records.clear();
  }
}
