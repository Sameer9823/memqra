import type {
  Memory,
  NewMemoryInput,
  MemoryPatch,
  MemoryConflict,
  IdentityResolver,
  DuplicateDetector,
  ConflictDetector,
  IngestResult,
} from "@memorie/types";
import type { MemoryStore } from "@memorie/storage";

export interface EvolutionPipelineDeps {
  memoryStore: MemoryStore;
  identityResolver: IdentityResolver;
  duplicateDetector: DuplicateDetector;
  conflictDetector: ConflictDetector;
  /** Create a brand-new memory (runs the normal add() path: validation, versioning, indexing, events). */
  createMemory: (input: NewMemoryInput) => Promise<Memory>;
  /** Apply an evolving patch to an existing memory (runs the normal update() path). */
  updateMemory: (id: string, patch: MemoryPatch) => Promise<Memory>;
  /** Persist an open MemoryConflict and emit memory.conflict_detected. */
  recordConflict: (conflict: MemoryConflict) => Promise<void>;
  idGenerator: () => string;
  clock: () => Date;
}

function toPatch(input: NewMemoryInput): MemoryPatch {
  const patch: MemoryPatch = { content: input.content };
  if (input.importance !== undefined) patch.importance = input.importance;
  if (input.confidence !== undefined) patch.confidence = input.confidence;
  if (input.source !== undefined) patch.source = input.source;
  if (input.metadata !== undefined) patch.metadata = input.metadata;
  if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt;
  return patch;
}

/**
 * Runs incoming information through the Phase 4 evolution pipeline
 * (spec section 8):
 *
 *   Incoming Information -> Identity Resolution -> New or Existing?
 *     NEW      -> Create
 *     EXISTING -> Compare -> Duplicate | Conflict | Update
 *
 * This function only decides *what* to do; the actual store mutations
 * are delegated to `deps.createMemory`/`deps.updateMemory` so that the
 * normal validation/versioning/indexing/event-emission paths in
 * MemoryEngine are reused rather than duplicated.
 */
export async function runIngestPipeline(
  input: NewMemoryInput,
  deps: EvolutionPipelineDeps,
): Promise<IngestResult> {
  const candidates = await deps.memoryStore.list({
    tenantId: input.tenantId,
    namespace: input.namespace,
    subjectId: input.subjectId,
    filters: { type: input.type, state: ["active", "updated"] },
  });

  const identityMatch = await deps.identityResolver.resolve(input, candidates);

  if (!identityMatch) {
    // No resolvable identity. Still check whether this exact/near-exact
    // content already exists anywhere in scope, so re-submitting the
    // same unstructured fact doesn't create endless copies.
    for (const candidate of candidates) {
      const verdict = await deps.duplicateDetector.check(input, candidate);
      if (verdict.isDuplicate) {
        return { outcome: "duplicate", memory: candidate, skipped: input };
      }
    }
    const created = await deps.createMemory(input);
    return { outcome: "created", memory: created };
  }

  const existing = candidates.find((c) => c.id === identityMatch.memoryId);
  if (!existing) {
    // Identity resolver returned an id outside the candidate pool it was
    // given — treat defensively as "no match" rather than trusting it.
    const created = await deps.createMemory(input);
    return { outcome: "created", memory: created };
  }

  const duplicateVerdict = await deps.duplicateDetector.check(input, existing);
  if (duplicateVerdict.isDuplicate) {
    return { outcome: "duplicate", memory: existing, skipped: input, identityMatch };
  }

  const conflictVerdict = await deps.conflictDetector.check(input, existing);
  if (conflictVerdict.isConflict) {
    const created = await deps.createMemory(input);
    const conflict: MemoryConflict = {
      id: deps.idGenerator(),
      memoryA: existing.id,
      memoryB: created.id,
      type: conflictVerdict.type,
      confidence: conflictVerdict.confidence,
      status: "open",
      createdAt: deps.clock(),
    };
    await deps.recordConflict(conflict);
    return { outcome: "conflict", memory: created, conflict, identityMatch };
  }

  const updated = await deps.updateMemory(existing.id, toPatch(input));
  return { outcome: "updated", memory: updated, previous: existing, identityMatch };
}
