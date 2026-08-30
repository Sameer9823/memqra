import type { Pool } from "pg";
import type { VersionStore } from "@memorie/storage";
import type { Memory, MemoryVersion } from "@memorie/types";
import { CREATE_VERSIONS_TABLE } from "./schema.js";

type Queryable = Pick<Pool, "query">;

interface VersionRow {
  memory_id: string;
  version: number;
  change_type: string;
  reason: string | null;
  snapshot: Record<string, unknown>;
  created_at: Date;
}

function reviveDates(snapshot: Record<string, unknown>): Memory {
  const dateKeys = ["createdAt", "updatedAt", "lastAccessedAt", "expiresAt"];
  const revived: Record<string, unknown> = { ...snapshot };
  for (const key of dateKeys) {
    const value = revived[key];
    if (typeof value === "string") {
      revived[key] = new Date(value);
    }
  }
  return revived as unknown as Memory;
}

function rowToVersion(row: VersionRow): MemoryVersion {
  return {
    memoryId: row.memory_id,
    version: row.version,
    changeType: row.change_type as MemoryVersion["changeType"],
    reason: row.reason ?? undefined,
    snapshot: reviveDates(row.snapshot),
    createdAt: new Date(row.created_at),
  };
}

/** PostgreSQL-backed VersionStore. Call `await store.init()` once before use. */
export class PostgresVersionStore implements VersionStore {
  private readonly runner: Queryable;

  constructor(pool: Pool, runner?: Queryable) {
    this.runner = runner ?? pool;
  }

  async init(): Promise<void> {
    await this.runner.query(CREATE_VERSIONS_TABLE);
  }

  async append(version: MemoryVersion): Promise<void> {
    await this.runner.query(
      `INSERT INTO memory_versions (memory_id, version, change_type, reason, snapshot, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (memory_id, version) DO UPDATE SET
         change_type = EXCLUDED.change_type, reason = EXCLUDED.reason,
         snapshot = EXCLUDED.snapshot, created_at = EXCLUDED.created_at`,
      [
        version.memoryId,
        version.version,
        version.changeType,
        version.reason ?? null,
        JSON.stringify(version.snapshot),
        version.createdAt,
      ],
    );
  }

  async list(memoryId: string): Promise<MemoryVersion[]> {
    const result = await this.runner.query(
      "SELECT * FROM memory_versions WHERE memory_id = $1 ORDER BY version ASC",
      [memoryId],
    );
    return (result.rows as VersionRow[]).map(rowToVersion);
  }

  async get(memoryId: string, version: number): Promise<MemoryVersion | null> {
    const result = await this.runner.query(
      "SELECT * FROM memory_versions WHERE memory_id = $1 AND version = $2",
      [memoryId, version],
    );
    const row = result.rows[0] as VersionRow | undefined;
    return row ? rowToVersion(row) : null;
  }

  async getAt(memoryId: string, timestamp: Date): Promise<MemoryVersion | null> {
    const result = await this.runner.query(
      `SELECT * FROM memory_versions
       WHERE memory_id = $1 AND created_at <= $2
       ORDER BY created_at DESC LIMIT 1`,
      [memoryId, timestamp],
    );
    const row = result.rows[0] as VersionRow | undefined;
    return row ? rowToVersion(row) : null;
  }

  async deleteAll(memoryId: string): Promise<void> {
    await this.runner.query("DELETE FROM memory_versions WHERE memory_id = $1", [memoryId]);
  }
}
