import type Database from "better-sqlite3";
import type { Memory } from "@memorie/types";

export const CREATE_MEMORIES_TABLE = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  namespace TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  state TEXT NOT NULL,
  importance REAL NOT NULL,
  confidence REAL NOT NULL,
  source TEXT,
  metadata TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_accessed_at INTEGER,
  access_count INTEGER NOT NULL,
  expires_at INTEGER,
  version INTEGER NOT NULL,
  superseded_by TEXT,
  supersedes TEXT,
  merged_from TEXT
);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories (tenant_id, namespace, subject_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (type);
CREATE INDEX IF NOT EXISTS idx_memories_state ON memories (state);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories (created_at);
CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories (updated_at);
`;

export const CREATE_VERSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS memory_versions (
  memory_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  change_type TEXT NOT NULL,
  reason TEXT,
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (memory_id, version)
);
CREATE INDEX IF NOT EXISTS idx_versions_memory ON memory_versions (memory_id);
`;

export function initSchema(db: Database.Database): void {
  db.exec(CREATE_MEMORIES_TABLE);
  db.exec(CREATE_VERSIONS_TABLE);
}

export interface MemoryRow {
  id: string;
  tenant_id: string | null;
  namespace: string;
  subject_id: string;
  type: string;
  content: string;
  state: string;
  importance: number;
  confidence: number;
  source: string | null;
  metadata: string;
  created_at: number;
  updated_at: number;
  last_accessed_at: number | null;
  access_count: number;
  expires_at: number | null;
  version: number;
  superseded_by: string | null;
  supersedes: string | null;
  merged_from: string | null;
}

export function memoryToRow(memory: Memory): MemoryRow {
  return {
    id: memory.id,
    tenant_id: memory.tenantId ?? null,
    namespace: memory.namespace,
    subject_id: memory.subjectId,
    type: memory.type,
    content: memory.content,
    state: memory.state,
    importance: memory.importance,
    confidence: memory.confidence,
    source: memory.source ?? null,
    metadata: JSON.stringify(memory.metadata ?? {}),
    created_at: memory.createdAt.getTime(),
    updated_at: memory.updatedAt.getTime(),
    last_accessed_at: memory.lastAccessedAt ? memory.lastAccessedAt.getTime() : null,
    access_count: memory.accessCount,
    expires_at: memory.expiresAt ? memory.expiresAt.getTime() : null,
    version: memory.version,
    superseded_by: memory.supersededBy ?? null,
    supersedes: memory.supersedes ?? null,
    merged_from: memory.mergedFrom ? JSON.stringify(memory.mergedFrom) : null,
  };
}

export function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? undefined,
    namespace: row.namespace,
    subjectId: row.subject_id,
    type: row.type,
    content: row.content,
    state: row.state as Memory["state"],
    importance: row.importance,
    confidence: row.confidence,
    source: row.source ?? undefined,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined,
    accessCount: row.access_count,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    version: row.version,
    supersededBy: row.superseded_by ?? undefined,
    supersedes: row.supersedes ?? undefined,
    mergedFrom: row.merged_from ? (JSON.parse(row.merged_from) as string[]) : undefined,
  };
}
