import type { VersionStore } from "@memorie/storage";
import type { MemoryVersion } from "@memorie/types";

/**
 * A no-op VersionStore. Used as the default when the caller does not
 * configure versioning, so history()/getVersion()/getAt() degrade to
 * empty results instead of throwing. `engine.capabilities().versioning`
 * reports `false` in this case.
 */
export class NullVersionStore implements VersionStore {
  async append(_version: MemoryVersion): Promise<void> {
    // intentionally a no-op
  }

  async list(_memoryId: string): Promise<MemoryVersion[]> {
    return [];
  }

  async get(_memoryId: string, _version: number): Promise<MemoryVersion | null> {
    return null;
  }

  async getAt(_memoryId: string, _timestamp: Date): Promise<MemoryVersion | null> {
    return null;
  }

  async deleteAll(_memoryId: string): Promise<void> {
    // intentionally a no-op
  }
}
