import type Database from "better-sqlite3";
import type { VersionStore } from "@memorie/storage";
import type { Memory, MemoryVersion } from "@memorie/types";
import { initSchema } from "./schema.js";

interface VersionRow {
  memory_id: string;
  version: number;
  change_type: string;
  reason: string | null;
  snapshot: string;
  created_at: number;
}

function rowToVersion(row: VersionRow): MemoryVersion {
  return {
    memoryId: row.memory_id,
    version: row.version,
    changeType: row.change_type as MemoryVersion["changeType"],
    reason: row.reason ?? undefined,
    snapshot: JSON.parse(row.snapshot, (key, value) => {
      if (
        (key === "createdAt" ||
          key === "updatedAt" ||
          key === "lastAccessedAt" ||
          key === "expiresAt") &&
        typeof value === "string"
      ) {
        return new Date(value);
      }
      return value;
    }) as Memory,
    createdAt: new Date(row.created_at),
  };
}

export class SqliteVersionStore implements VersionStore {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    initSchema(this.db);
  }

  async append(version: MemoryVersion): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO memory_versions
          (memory_id, version, change_type, reason, snapshot, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        version.memoryId,
        version.version,
        version.changeType,
        version.reason ?? null,
        JSON.stringify(version.snapshot),
        version.createdAt.getTime(),
      );
  }

  async list(memoryId: string): Promise<MemoryVersion[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM memory_versions WHERE memory_id = ? ORDER BY version ASC",
      )
      .all(memoryId) as VersionRow[];
    return rows.map(rowToVersion);
  }

  async get(memoryId: string, version: number): Promise<MemoryVersion | null> {
    const row = this.db
      .prepare("SELECT * FROM memory_versions WHERE memory_id = ? AND version = ?")
      .get(memoryId, version) as VersionRow | undefined;
    return row ? rowToVersion(row) : null;
  }

  async getAt(memoryId: string, timestamp: Date): Promise<MemoryVersion | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM memory_versions
         WHERE memory_id = ? AND created_at <= ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(memoryId, timestamp.getTime()) as VersionRow | undefined;
    return row ? rowToVersion(row) : null;
  }

  async deleteAll(memoryId: string): Promise<void> {
    this.db.prepare("DELETE FROM memory_versions WHERE memory_id = ?").run(memoryId);
  }
}
