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
  importance DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  superseded_by TEXT,
  supersedes TEXT,
  merged_from JSONB
);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories (tenant_id, namespace, subject_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (type);
CREATE INDEX IF NOT EXISTS idx_memories_state ON memories (state);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories (created_at);
CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories (updated_at);
CREATE INDEX IF NOT EXISTS idx_memories_metadata ON memories USING GIN (metadata);
`;

export const CREATE_VERSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS memory_versions (
  memory_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  change_type TEXT NOT NULL,
  reason TEXT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (memory_id, version)
);
CREATE INDEX IF NOT EXISTS idx_versions_memory ON memory_versions (memory_id);
`;

export const CREATE_CONFLICTS_TABLE = `
CREATE TABLE IF NOT EXISTS memory_conflicts (
  id TEXT PRIMARY KEY,
  memory_a TEXT NOT NULL,
  memory_b TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  resolution TEXT,
  resolved_memory_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_conflicts_memory_a ON memory_conflicts (memory_a);
CREATE INDEX IF NOT EXISTS idx_conflicts_memory_b ON memory_conflicts (memory_b);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON memory_conflicts (status);
`;

/** Raw row shape as returned by `pg` (snake_case columns, JSONB pre-parsed to objects). */
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
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  last_accessed_at: Date | null;
  access_count: number;
  expires_at: Date | null;
  version: number;
  superseded_by: string | null;
  supersedes: string | null;
  merged_from: string[] | null;
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
    metadata: memory.metadata ?? {},
    created_at: memory.createdAt,
    updated_at: memory.updatedAt,
    last_accessed_at: memory.lastAccessedAt ?? null,
    access_count: memory.accessCount,
    expires_at: memory.expiresAt ?? null,
    version: memory.version,
    superseded_by: memory.supersededBy ?? null,
    supersedes: memory.supersedes ?? null,
    merged_from: memory.mergedFrom ?? null,
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
    metadata: row.metadata ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined,
    accessCount: row.access_count,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    version: row.version,
    supersededBy: row.superseded_by ?? undefined,
    supersedes: row.supersedes ?? undefined,
    mergedFrom: row.merged_from ?? undefined,
  };
}
