import type { VersionStore } from "@memorie/storage";
import type { MemoryVersion } from "@memorie/types";

export class InMemoryVersionStore implements VersionStore {
  private readonly versions = new Map<string, MemoryVersion[]>();

  async append(version: MemoryVersion): Promise<void> {
    const list = this.versions.get(version.memoryId) ?? [];
    list.push(structuredClone(version));
    this.versions.set(version.memoryId, list);
  }

  async list(memoryId: string): Promise<MemoryVersion[]> {
    return (this.versions.get(memoryId) ?? []).map((v) => structuredClone(v));
  }

  async get(memoryId: string, version: number): Promise<MemoryVersion | null> {
    const found = (this.versions.get(memoryId) ?? []).find(
      (v) => v.version === version,
    );
    return found ? structuredClone(found) : null;
  }

  async getAt(memoryId: string, timestamp: Date): Promise<MemoryVersion | null> {
    const list = this.versions.get(memoryId) ?? [];
    let best: MemoryVersion | null = null;
    for (const v of list) {
      if (v.createdAt.getTime() <= timestamp.getTime()) {
        if (!best || v.createdAt.getTime() > best.createdAt.getTime()) {
          best = v;
        }
      }
    }
    return best ? structuredClone(best) : null;
  }

  async deleteAll(memoryId: string): Promise<void> {
    this.versions.delete(memoryId);
  }
}
