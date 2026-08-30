import type {
  Memory,
  MemoryVersion,
  MemoryPatch,
  NewMemoryInput,
  ListOptions,
  CountOptions,
  SearchQuery,
  SearchResult,
  EngineCapabilities,
  RankingWeights,
  EmbeddingProvider,
  IdentityResolver,
  DuplicateDetector,
  ConflictDetector,
  ConflictResolutionStrategy,
  MemoryIntelligenceProvider,
  IngestResult,
  ConflictResolutionResult,
  MemoryRelation,
  RelationType,
  GraphQueryOptions,
  TraversalOptions,
  Logger,
  MetricsProvider,
  Tracer,
  Span,
  AuthorizeFn,
  RedactFn,
  RedactionContext,
  MemoryExport,
  ExportOptions,
  ImportOptions,
  ImportResult,
  ReconcileOptions,
  ReconciliationReport,
  ReconciliationIssue,
  ReindexOptions,
  ReindexReport,
} from "@memorie/types";
import {
  MemoryNotFoundError,
  UnsupportedCapabilityError,
  MemorieError,
  AuthorizationError,
  DEFAULT_RANKING_WEIGHTS,
} from "@memorie/types";
import type {
  MemoryStore,
  VersionStore,
  SearchStore,
  VectorStore,
  GraphStore,
  CacheStore,
  ProvenanceStore,
  ConflictStore,
} from "@memorie/storage";
import { isTransactional } from "@memorie/storage";
import { assertTransition } from "./lifecycle.js";
import { validateNewMemoryInput, validateMemoryPatch } from "./validation.js";
import { MemorieEventEmitter } from "./event-emitter.js";
import { NullVersionStore } from "./null-version-store.js";
import { hybridSearch } from "./hybrid-search.js";
import { createDefaultIdentityResolver } from "./evolution/identity-resolver.js";
import { createNormalizedTextDuplicateDetector } from "./evolution/duplicate-detector.js";
import { createDefaultConflictDetector } from "./evolution/conflict-detector.js";
import { runIngestPipeline } from "./evolution/evolution-pipeline.js";
import { decideResolution } from "./evolution/conflict-resolution.js";

/** Phase 4 evolution pipeline configuration (spec sections 7-8, 16-19). All fields optional. */
export interface EvolutionConfig {
  identityResolver?: IdentityResolver;
  duplicateDetector?: DuplicateDetector;
  conflictDetector?: ConflictDetector;
  /** Default strategy used by resolveConflict() when no strategy is passed explicitly. Defaults to "manual" (no auto-resolution). */
  resolutionStrategy?: ConflictResolutionStrategy;
  /** Optional. Powers real conflict detection and the "merge" resolution strategy. Core functionality works without it. */
  intelligenceProvider?: MemoryIntelligenceProvider;
  /** metadata key used by the default identity resolver. Defaults to "key". */
  identityKey?: string;
}

/** Provider-independent observability hooks (spec section 59). All optional; no-ops when omitted. */
export interface ObservabilityConfig {
  logger?: Logger;
  metrics?: MetricsProvider;
  tracer?: Tracer;
}

/** Authorization/redaction hooks (spec section 43). All optional; operations proceed unmodified when omitted. */
export interface SecurityConfig {
  authorizeRead?: AuthorizeFn;
  authorizeWrite?: AuthorizeFn;
  authorizeDelete?: AuthorizeFn;
  /**
   * Applied to every memory on its way out of a read-path operation
   * (get/recall/list/search/export), after authorization passes. See
   * `RedactFn` in `@memorie/types` for why this is separate from the
   * authorize hooks above.
   */
  redact?: RedactFn;
}

export interface MemoryEngineConfig {
  memoryStore: MemoryStore;
  versionStore?: VersionStore;
  searchStore?: SearchStore;
  vectorStore?: VectorStore;
  /** Required alongside vectorStore to actually embed content on add()/update() and embed queries in search(). */
  embeddingProvider?: EmbeddingProvider;
  graphStore?: GraphStore;
  cacheStore?: CacheStore;
  provenanceStore?: ProvenanceStore;
  /** Required for ingest()'s "conflict" outcome and resolveConflict(). */
  conflictStore?: ConflictStore;
  ranking?: Partial<RankingWeights>;
  evolution?: EvolutionConfig;
  observability?: ObservabilityConfig;
  security?: SecurityConfig;
  /** Called to generate ids. Defaults to crypto.randomUUID(). */
  idGenerator?: () => string;
  /** Called to get "now". Overridable for tests. */
  clock?: () => Date;
}

export interface ForgetOptions {
  id?: string;
  tenantId?: string;
  namespace?: string;
  subjectId?: string;
  type?: string;
}

/**
 * Restores Date instances on a Memory pulled out of a CacheStore.
 * InMemoryCacheStore keeps real Date objects, but a serializing adapter
 * (e.g. RedisCacheStore, which JSON-encodes values) turns them into ISO
 * strings — this makes cached reads indistinguishable from a direct
 * MemoryStore.get() either way.
 */
function reviveMemoryDates(memory: Memory): Memory {
  const toDate = (value: Date | string | null | undefined): Date | null | undefined =>
    value == null || value instanceof Date ? value : new Date(value);
  return {
    ...memory,
    createdAt: toDate(memory.createdAt) as Date,
    updatedAt: toDate(memory.updatedAt) as Date,
    lastAccessedAt: toDate(memory.lastAccessedAt) as Date | undefined,
    expiresAt: toDate(memory.expiresAt) as Date | null | undefined,
  };
}

/** Shared no-op Span used when no Tracer is configured (see MemoryEngine.startSpan). */
const NOOP_SPAN: Span = {
  setAttribute() {},
  recordException() {},
  end() {},
};

/**
 * The Memorie memory engine. Orchestrates the canonical MemoryStore plus
 * optional secondary projections (vector/search/graph/cache). See
 * docs/ARCHITECTURE.md for the "canonical + projections" model this
 * class implements.
 */
export class MemoryEngine {
  readonly events = new MemorieEventEmitter();

  private readonly memoryStore: MemoryStore;
  private readonly versionStore: VersionStore;
  private readonly searchStore?: SearchStore;
  private readonly vectorStore?: VectorStore;
  private readonly embeddingProvider?: EmbeddingProvider;
  private readonly graphStore?: GraphStore;
  private readonly cacheStore?: CacheStore;
  private readonly provenanceStore?: ProvenanceStore;
  private readonly conflictStore?: ConflictStore;
  private readonly ranking: RankingWeights;
  private readonly idGenerator: () => string;
  private readonly clock: () => Date;

  private readonly identityResolver: IdentityResolver;
  private readonly duplicateDetector: DuplicateDetector;
  private readonly conflictDetector: ConflictDetector;
  private readonly resolutionStrategy: ConflictResolutionStrategy;
  private readonly intelligenceProvider?: MemoryIntelligenceProvider;

  private readonly logger?: Logger;
  private readonly metrics?: MetricsProvider;
  private readonly tracer?: Tracer;
  private readonly authorizeRead?: AuthorizeFn;
  private readonly authorizeWrite?: AuthorizeFn;
  private readonly authorizeDelete?: AuthorizeFn;
  private readonly redact?: RedactFn;

  constructor(config: MemoryEngineConfig) {
    this.memoryStore = config.memoryStore;
    this.versionStore = config.versionStore ?? new NullVersionStore();
    this.searchStore = config.searchStore;
    this.vectorStore = config.vectorStore;
    this.embeddingProvider = config.embeddingProvider;
    this.graphStore = config.graphStore;
    this.cacheStore = config.cacheStore;
    this.provenanceStore = config.provenanceStore;
    this.conflictStore = config.conflictStore;
    this.ranking = { ...DEFAULT_RANKING_WEIGHTS, ...config.ranking };
    this.idGenerator = config.idGenerator ?? (() => crypto.randomUUID());
    this.clock = config.clock ?? (() => new Date());

    this.intelligenceProvider = config.evolution?.intelligenceProvider;
    this.identityResolver =
      config.evolution?.identityResolver ?? createDefaultIdentityResolver(config.evolution?.identityKey);
    this.duplicateDetector = config.evolution?.duplicateDetector ?? createNormalizedTextDuplicateDetector();
    this.conflictDetector =
      config.evolution?.conflictDetector ?? createDefaultConflictDetector(this.intelligenceProvider);
    this.resolutionStrategy = config.evolution?.resolutionStrategy ?? "manual";

    this.logger = config.observability?.logger;
    this.metrics = config.observability?.metrics;
    this.tracer = config.observability?.tracer;
    this.authorizeRead = config.security?.authorizeRead;
    this.authorizeWrite = config.security?.authorizeWrite;
    this.authorizeDelete = config.security?.authorizeDelete;
    this.redact = config.security?.redact;
  }

  capabilities(): EngineCapabilities {
    return {
      memory: true,
      search: true, // structured/keyword search always available via the hybrid pipeline fallback
      vector: Boolean(this.vectorStore),
      graph: Boolean(this.graphStore),
      cache: Boolean(this.cacheStore),
      blob: false,
      versioning: !(this.versionStore instanceof NullVersionStore),
      provenance: Boolean(this.provenanceStore),
      transactions: isTransactional(this.memoryStore),
      conflictResolution: Boolean(this.conflictStore),
    };
  }

  // ---------------------------------------------------------------------
  // Core CRUD (spec section 54)
  // ---------------------------------------------------------------------

  async add(input: NewMemoryInput): Promise<Memory> {
    const span = this.startSpan("memorie.add", { namespace: input.namespace, type: input.type });
    try {
      await this.checkAuthorization(this.authorizeWrite, "write", {
        tenantId: input.tenantId,
        namespace: input.namespace,
        subjectId: input.subjectId,
      });
      validateNewMemoryInput(input);
      const now = this.clock();
      const memory: Memory = {
        id: this.idGenerator(),
        tenantId: input.tenantId,
        namespace: input.namespace,
        subjectId: input.subjectId,
        type: input.type,
        content: input.content,
        state: "active",
        importance: input.importance ?? 0.5,
        confidence: input.confidence ?? 0.5,
        source: input.source,
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        expiresAt: input.expiresAt ?? null,
        version: 1,
      };

      const created = await this.memoryStore.create(memory);
      await this.recordVersion(created, "created");
      await this.searchStore?.index(created);
      await this.indexEmbedding(created);
      this.metric("increment", "memorie.memory.created", 1, { namespace: input.namespace, type: input.type });
      this.log("debug", "memory created", { id: created.id, namespace: created.namespace, type: created.type });
      this.events.emit("memory.created", { memory: created });
      span.setAttribute("memory.id", created.id);
      return created;
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  }

  /** Alias for add(). Emphasizes the "remember" mental model from spec section 54. */
  remember(input: NewMemoryInput): Promise<Memory> {
    return this.add(input);
  }

  /**
   * Cache-aside read (spec section 31): checks the configured CacheStore
   * first, falling back to the canonical MemoryStore on a miss and
   * populating the cache. Without a CacheStore configured, always reads
   * straight through — same result, just no caching.
   */
  async get(id: string): Promise<Memory | null> {
    await this.checkAuthorization(this.authorizeRead, "read", { memoryId: id });
    const start = Date.now();
    const span = this.startSpan("memorie.get", { "memory.id": id });
    try {
      if (this.cacheStore) {
        const cached = await this.cacheStore.get<Memory>(this.cacheKey(id));
        if (cached) {
          this.metric("increment", "memorie.cache.hit");
          span.setAttribute("cache.hit", true);
          const revived = reviveMemoryDates(cached);
          return this.applyRedaction(revived, { operation: "get" });
        }
        this.metric("increment", "memorie.cache.miss");
        span.setAttribute("cache.hit", false);
      }
      const memory = await this.memoryStore.get(id);
      if (memory && this.cacheStore) {
        // Cache the canonical, un-redacted memory — redaction is applied
        // per read below, not baked into what's stored.
        await this.cacheStore.set(this.cacheKey(id), memory);
      }
      return memory ? this.applyRedaction(memory, { operation: "get" }) : memory;
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      this.metric("histogram", "memorie.get.latency_ms", Date.now() - start);
      span.end();
    }
  }

  /** Like get(), but tracks access (lastAccessedAt/accessCount) and emits memory.accessed. */
  async recall(id: string): Promise<Memory | null> {
    await this.checkAuthorization(this.authorizeRead, "read", { memoryId: id });
    const memory = await this.memoryStore.get(id);
    if (!memory) return null;
    const updated = await this.memoryStore.update(id, {
      lastAccessedAt: this.clock(),
      accessCount: memory.accessCount + 1,
    });
    await this.invalidateCache(id);
    this.events.emit("memory.accessed", { memory: updated });
    return this.applyRedaction(updated, { operation: "recall" });
  }

  async update(
    id: string,
    patch: MemoryPatch,
    options?: { expectedVersion?: number; reason?: string },
  ): Promise<Memory> {
    const span = this.startSpan("memorie.update", { "memory.id": id });
    try {
      await this.checkAuthorization(this.authorizeWrite, "write", { memoryId: id });
      validateMemoryPatch(patch);
      const existing = await this.memoryStore.get(id);
      if (!existing) {
        throw new MemoryNotFoundError(id);
      }
      if (patch.state && patch.state !== existing.state) {
        assertTransition(existing.state, patch.state);
      }

      const now = this.clock();
      const nextState = patch.state ?? (existing.state === "active" ? "updated" : existing.state);
      const updated = await this.memoryStore.update(
        id,
        { ...patch, state: nextState, updatedAt: now, version: existing.version + 1 },
        { expectedVersion: options?.expectedVersion },
      );

      await this.recordVersion(updated, "updated", options?.reason);
      await this.searchStore?.index(updated);
      await this.indexEmbedding(updated);
      await this.invalidateCache(id);
      this.metric("increment", "memorie.memory.updated", 1, { namespace: updated.namespace, type: updated.type });
      this.log("debug", "memory updated", { id: updated.id, version: updated.version });
      this.events.emit("memory.updated", { memory: updated, previous: existing });
      span.setAttribute("memory.version", updated.version);
      return updated;
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  }

  /**
   * Directed evolution: apply a validated, versioned patch to a memory
   * whose `id` you already know. This is the primitive `ingest()` is
   * built on. Use `evolve()` when the caller already decided which
   * memory this update is about; use `ingest()` when it hasn't.
   */
  evolve(
    id: string,
    patch: MemoryPatch,
    options?: { expectedVersion?: number; reason?: string },
  ): Promise<Memory> {
    return this.update(id, patch, options);
  }

  // ---------------------------------------------------------------------
  // Memory evolution pipeline (spec sections 7-8, 16-18, Phase 4).
  // ---------------------------------------------------------------------

  /**
   * Runs incoming information through the full evolution pipeline:
   * identity resolution decides whether it's about an existing memory;
   * if so, duplicate/conflict detection decide whether to ignore it, flag
   * a conflict, or evolve the existing memory. See docs/MEMORY-EVOLUTION.md
   * and EvolutionConfig for how to configure identity/duplicate/conflict
   * policies. Without any configured, this degrades to conservative,
   * non-AI defaults — it never fabricates a decision (spec section 77).
   */
  async ingest(input: NewMemoryInput): Promise<IngestResult> {
    const span = this.startSpan("memorie.ingest", { namespace: input.namespace, type: input.type });
    try {
      validateNewMemoryInput(input);
      const result = await runIngestPipeline(input, {
        memoryStore: this.memoryStore,
        identityResolver: this.identityResolver,
        duplicateDetector: this.duplicateDetector,
        conflictDetector: this.conflictDetector,
        createMemory: (i) => this.add(i),
        updateMemory: (id, patch) => this.update(id, patch),
        recordConflict: async (conflict) => {
          if (!this.conflictStore) {
            throw new UnsupportedCapabilityError(
              "conflict detection requires a ConflictStore to be configured (MemoryEngineConfig.conflictStore)",
            );
          }
          await this.conflictStore.record(conflict);
          this.metric("increment", "memorie.conflict.detected");
          this.events.emit("memory.conflict_detected", { conflict });
          await this.linkGraph(conflict.memoryA, conflict.memoryB, "contradicts");
        },
        idGenerator: this.idGenerator,
        clock: this.clock,
      });
      span.setAttribute("ingest.outcome", result.outcome);
      return result;
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  }

  /**
   * Applies a resolution strategy (spec section 17) to an open conflict
   * previously recorded by ingest(). Defaults to the engine's configured
   * `evolution.resolutionStrategy` ("manual" — i.e. requires an explicit
   * strategy here — unless configured otherwise).
   */
  async resolveConflict(
    conflictId: string,
    strategy?: ConflictResolutionStrategy,
  ): Promise<ConflictResolutionResult> {
    const span = this.startSpan("memorie.resolveConflict", { "conflict.id": conflictId });
    try {
      return await this.resolveConflictInner(conflictId, strategy, span);
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  }

  private async resolveConflictInner(
    conflictId: string,
    strategy: ConflictResolutionStrategy | undefined,
    span: Span,
  ): Promise<ConflictResolutionResult> {
    if (!this.conflictStore) {
      throw new UnsupportedCapabilityError("conflictStore");
    }
    const conflict = await this.conflictStore.get(conflictId);
    if (!conflict) {
      throw new MemoryNotFoundError(conflictId, { details: { kind: "conflict" } });
    }
    if (conflict.status === "resolved") {
      throw new MemorieError(`Conflict ${conflictId} is already resolved`, "CONFLICT_ALREADY_RESOLVED");
    }

    const [memoryA, memoryB] = await Promise.all([
      this.memoryStore.get(conflict.memoryA),
      this.memoryStore.get(conflict.memoryB),
    ]);
    if (!memoryA) throw new MemoryNotFoundError(conflict.memoryA);
    if (!memoryB) throw new MemoryNotFoundError(conflict.memoryB);

    const effectiveStrategy = strategy ?? this.resolutionStrategy;
    span.setAttribute("resolution.strategy", effectiveStrategy);
    const decision = await decideResolution(effectiveStrategy, memoryA, memoryB, this.intelligenceProvider);

    const now = this.clock();

    if (decision.merged) {
      const mergedInput: NewMemoryInput = {
        tenantId: memoryA.tenantId,
        namespace: memoryA.namespace,
        subjectId: memoryA.subjectId,
        type: memoryA.type,
        content: decision.merged.content,
        importance: Math.max(memoryA.importance, memoryB.importance),
        confidence: decision.merged.confidence ?? Math.max(memoryA.confidence, memoryB.confidence),
        metadata: decision.merged.metadata ?? memoryA.metadata,
      };
      const created = await this.add(mergedInput);
      const withSources = await this.memoryStore.update(created.id, { mergedFrom: [memoryA.id, memoryB.id] });
      await this.invalidateCache(created.id);
      await this.markSuperseded(memoryA, withSources.id, "merged", now);
      await this.markSuperseded(memoryB, withSources.id, "merged", now);
      const resolved = await this.conflictStore.resolve(conflictId, effectiveStrategy, withSources.id, now);
      this.metric("increment", "memorie.consolidation", 1, { strategy: effectiveStrategy });
      this.events.emit("memory.merged", { memory: withSources, mergedFrom: [memoryA.id, memoryB.id] });
      this.events.emit("memory.consolidated", { memory: withSources, sourceIds: [memoryA.id, memoryB.id] });
      await this.linkGraph(withSources.id, memoryA.id, "derived_from");
      await this.linkGraph(withSources.id, memoryB.id, "derived_from");
      return { conflict: resolved, winner: withSources, strategy: effectiveStrategy };
    }

    const winner = decision.winner;
    const loser = decision.loser;
    if (loser) {
      const supersededLoser = await this.markSuperseded(loser, winner.id, "superseded", now);
      const supersedingWinner = await this.memoryStore.update(winner.id, { supersedes: loser.id });
      await this.invalidateCache(winner.id);
      const resolved = await this.conflictStore.resolve(conflictId, effectiveStrategy, winner.id, now);
      this.metric("increment", "memorie.conflict.resolved", 1, { strategy: effectiveStrategy });
      this.events.emit("memory.superseded", { previous: supersededLoser, next: supersedingWinner });
      await this.linkGraph(supersedingWinner.id, supersededLoser.id, "supersedes");
      return { conflict: resolved, winner: supersedingWinner, loser: supersededLoser, strategy: effectiveStrategy };
    }

    const resolved = await this.conflictStore.resolve(conflictId, effectiveStrategy, winner.id, now);
    return { conflict: resolved, winner, strategy: effectiveStrategy };
  }

  /**
   * Folds several existing memories into one using the configured
   * MemoryIntelligenceProvider (spec section 18). Requires
   * `evolution.intelligenceProvider` — consolidation needs semantic
   * judgement that the core deliberately does not fake without one
   * (spec section 77).
   */
  async consolidate(memoryIds: string[]): Promise<Memory> {
    const span = this.startSpan("memorie.consolidate", { "source.count": memoryIds.length });
    try {
      return await this.consolidateInner(memoryIds, span);
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  }

  private async consolidateInner(memoryIds: string[], span: Span): Promise<Memory> {
    if (!this.intelligenceProvider) {
      throw new UnsupportedCapabilityError(
        "consolidate() requires a MemoryIntelligenceProvider (MemoryEngineConfig.evolution.intelligenceProvider)",
      );
    }
    if (memoryIds.length < 2) {
      throw new MemorieError("consolidate() requires at least two memory ids", "VALIDATION_ERROR");
    }
    const sources = await Promise.all(memoryIds.map((id) => this.memoryStore.get(id)));
    for (let i = 0; i < memoryIds.length; i++) {
      if (!sources[i]) {
        throw new MemoryNotFoundError(memoryIds[i] as string);
      }
    }
    const memories = sources as Memory[];
    const consolidated = await this.intelligenceProvider.consolidate(memories);
    const first = memories[0] as Memory;

    const created = await this.add({
      tenantId: first.tenantId,
      namespace: first.namespace,
      subjectId: first.subjectId,
      type: first.type,
      content: consolidated.content,
      importance: consolidated.importance ?? Math.max(...memories.map((m) => m.importance)),
      confidence: consolidated.confidence ?? Math.max(...memories.map((m) => m.confidence)),
      metadata: consolidated.metadata ?? first.metadata,
    });
    const withSources = await this.memoryStore.update(created.id, { mergedFrom: memoryIds });
    await this.invalidateCache(created.id);

    const now = this.clock();
    for (const memory of memories) {
      await this.markSuperseded(memory, withSources.id, "merged", now);
    }
    this.metric("increment", "memorie.consolidation", 1, { source: "consolidate" });

    this.events.emit("memory.merged", { memory: withSources, mergedFrom: memoryIds });
    this.events.emit("memory.consolidated", { memory: withSources, sourceIds: memoryIds });
    for (const memory of memories) {
      await this.linkGraph(withSources.id, memory.id, "derived_from");
    }
    span.setAttribute("memory.id", withSources.id);
    return withSources;
  }

  async delete(id: string): Promise<void> {
    const span = this.startSpan("memorie.delete", { "memory.id": id });
    try {
      await this.checkAuthorization(this.authorizeDelete, "delete", { memoryId: id });
      await this.memoryStore.delete(id);
      await this.versionStore.deleteAll(id);
      await this.searchStore?.delete(id);
      await this.vectorStore?.delete(id);
      await this.invalidateCache(id);
      this.metric("increment", "memorie.memory.deleted");
      this.log("debug", "memory deleted", { id });
      this.events.emit("memory.deleted", { memoryId: id });
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  }

  async list(options?: ListOptions): Promise<Memory[]> {
    await this.checkAuthorization(this.authorizeRead, "read", {
      tenantId: options?.tenantId,
      namespace: options?.namespace,
      subjectId: options?.subjectId,
    });
    const memories = await this.memoryStore.list(options);
    return this.redact
      ? memories.map((m) =>
          this.applyRedaction(m, {
            operation: "list",
            tenantId: options?.tenantId,
            namespace: options?.namespace,
            subjectId: options?.subjectId,
          }),
        )
      : memories;
  }

  async count(options?: CountOptions): Promise<number> {
    await this.checkAuthorization(this.authorizeRead, "read", {
      tenantId: options?.tenantId,
      namespace: options?.namespace,
      subjectId: options?.subjectId,
    });
    return this.memoryStore.count(options);
  }

  // ---------------------------------------------------------------------
  // Retrieval (spec sections 24-26). The hybrid pipeline in hybrid-search.ts
  // always works, with or without a SearchStore configured (graceful
  // degradation, spec section 49); configuring one upgrades the "keyword"
  // signal from a naive substring match to real full-text relevance
  // without changing this call site. A GraphStore + query.relatedTo
  // upgrades the "relationship" signal the same way (spec section 25/27).
  // ---------------------------------------------------------------------

  async search(query: SearchQuery): Promise<SearchResult[]> {
    await this.checkAuthorization(this.authorizeRead, "read", {
      tenantId: query.tenantId,
      namespace: query.namespace,
      subjectId: query.subjectId,
    });
    const start = Date.now();
    const span = this.startSpan("memorie.search", { namespace: query.namespace ?? "" });
    try {
      const results = await hybridSearch(
        query,
        {
          memoryStore: this.memoryStore,
          searchStore: this.searchStore,
          vectorStore: this.vectorStore,
          embeddingProvider: this.embeddingProvider,
          graphStore: this.graphStore,
        },
        this.ranking,
        this.clock(),
      );
      span.setAttribute("result.count", results.length);
      return this.redact
        ? results.map((r) => ({
            ...r,
            memory: this.applyRedaction(r.memory, {
              operation: "search",
              tenantId: query.tenantId,
              namespace: query.namespace,
              subjectId: query.subjectId,
            }),
          }))
        : results;
    } catch (err) {
      span.recordException(err);
      throw err;
    } finally {
      this.metric("histogram", "memorie.search.latency_ms", Date.now() - start);
      span.end();
    }
  }

  // ---------------------------------------------------------------------
  // Versioning / time travel (spec sections 10-11)
  // ---------------------------------------------------------------------

  async history(memoryId: string): Promise<MemoryVersion[]> {
    return this.versionStore.list(memoryId);
  }

  async versions(memoryId: string): Promise<MemoryVersion[]> {
    return this.history(memoryId);
  }

  async getVersion(memoryId: string, version: number): Promise<MemoryVersion | null> {
    return this.versionStore.get(memoryId, version);
  }

  async getAt(memoryId: string, timestamp: Date): Promise<Memory | null> {
    const version = await this.versionStore.getAt(memoryId, timestamp);
    return version ? version.snapshot : null;
  }

  // ---------------------------------------------------------------------
  // Relationships (spec sections 27-28). Requires a GraphStore.
  // ---------------------------------------------------------------------

  /** Creates a relation between two memories (spec section 27) and emits memory.relation_created. */
  async relate(
    fromMemoryId: string,
    toMemoryId: string,
    type: RelationType,
    options?: { weight?: number; metadata?: Record<string, unknown> },
  ): Promise<MemoryRelation> {
    if (!this.graphStore) {
      throw new UnsupportedCapabilityError("graph");
    }
    const [from, to] = await Promise.all([
      this.memoryStore.get(fromMemoryId),
      this.memoryStore.get(toMemoryId),
    ]);
    if (!from) throw new MemoryNotFoundError(fromMemoryId);
    if (!to) throw new MemoryNotFoundError(toMemoryId);

    const relation: MemoryRelation = {
      id: this.idGenerator(),
      fromMemoryId,
      toMemoryId,
      type,
      weight: options?.weight,
      metadata: options?.metadata,
      createdAt: this.clock(),
    };
    await this.graphStore.createRelation(relation);
    this.events.emit("memory.relation_created", { relation });
    return relation;
  }

  /** Deletes a relation by id and emits memory.relation_deleted. */
  async unrelate(relationId: string): Promise<void> {
    if (!this.graphStore) {
      throw new UnsupportedCapabilityError("graph");
    }
    await this.graphStore.deleteRelation(relationId);
    this.events.emit("memory.relation_deleted", { relationId });
  }

  async related(memoryId: string, options?: GraphQueryOptions): Promise<Memory[]> {
    if (!this.graphStore) {
      throw new UnsupportedCapabilityError("graph");
    }
    return this.graphStore.getRelated(memoryId, options);
  }

  /** Multi-hop relationship traversal (spec section 28). Requires a GraphStore. */
  async traverse(memoryId: string, options?: TraversalOptions): Promise<Memory[]> {
    if (!this.graphStore) {
      throw new UnsupportedCapabilityError("graph");
    }
    return this.graphStore.traverse(memoryId, options);
  }

  // ---------------------------------------------------------------------
  // Forgetting (spec section 39)
  // ---------------------------------------------------------------------

  async forget(options: ForgetOptions): Promise<number> {
    if (options.id) {
      await this.delete(options.id);
      return 1;
    }

    const targets = await this.memoryStore.list({
      tenantId: options.tenantId,
      namespace: options.namespace,
      subjectId: options.subjectId,
      filters: options.type ? { type: options.type } : undefined,
    });

    for (const memory of targets) {
      await this.delete(memory.id);
    }
    return targets.length;
  }

  // ---------------------------------------------------------------------
  // Reindexing / reconciliation (spec sections 37-38, Phase 7)
  // ---------------------------------------------------------------------

  /**
   * Rebuilds the SearchStore/VectorStore projections from canonical data
   * (spec section 38). Unconditional — re-indexes every matching
   * canonical memory regardless of whether it looks up to date. Use this
   * after changing embedding models, recovering a projection from
   * scratch, or as the repair step reconcile() itself uses internally.
   */
  async reindex(options?: ReindexOptions): Promise<ReindexReport> {
    const doSearch = (options?.search ?? true) && Boolean(this.searchStore);
    const doVector = (options?.vector ?? true) && Boolean(this.vectorStore) && Boolean(this.embeddingProvider);
    const report: ReindexReport = { searchReindexed: 0, vectorReindexed: 0 };
    if (!doSearch && !doVector) return report;

    for await (const memory of this.iterateAllMemories()) {
      if (doSearch) {
        await this.searchStore?.index(memory);
        report.searchReindexed++;
      }
      if (doVector) {
        await this.indexEmbedding(memory);
        report.vectorReindexed++;
      }
    }
    this.log("info", "reindex complete", report as unknown as Record<string, unknown>);
    return report;
  }

  /**
   * Detects drift between canonical memory data and the SearchStore/
   * VectorStore projections (spec section 37): memories missing from a
   * projection, and entries in a projection that no longer correspond to
   * any canonical memory ("orphaned" — e.g. left behind by a delete that
   * happened outside the engine). A store is only checked when it both
   * (a) is configured and (b) implements the optional `listIds()`
   * method — without it there's no way to enumerate the projection's
   * contents, and reconcile() skips it rather than fabricating a result
   * (spec section 77; see `VectorStore.listIds`/`SearchStore.listIds`
   * docs in `@memorie/storage`).
   */
  async reconcile(options?: ReconcileOptions): Promise<ReconciliationReport> {
    const wantSearch = options?.stores ? options.stores.includes("search") : true;
    const wantVector = options?.stores ? options.stores.includes("vector") : true;
    const repair = options?.repair ?? false;

    const canonicalIds = new Set<string>();
    for await (const memory of this.iterateAllMemories()) {
      canonicalIds.add(memory.id);
    }

    const issues: ReconciliationIssue[] = [];
    let repaired = 0;

    if (wantSearch && this.searchStore?.listIds) {
      const projected = new Set(await this.searchStore.listIds());
      const { found, fixed } = await this.diffAndRepair("search", canonicalIds, projected, repair, async (id) => {
        const memory = await this.memoryStore.get(id);
        if (memory) await this.searchStore?.index(memory);
      }, (id) => this.searchStore!.delete(id));
      issues.push(...found);
      repaired += fixed;
    }

    if (wantVector && this.vectorStore?.listIds && this.embeddingProvider) {
      const projected = new Set(await this.vectorStore.listIds());
      const { found, fixed } = await this.diffAndRepair("vector", canonicalIds, projected, repair, async (id) => {
        const memory = await this.memoryStore.get(id);
        if (memory) await this.indexEmbedding(memory);
      }, (id) => this.vectorStore!.delete(id));
      issues.push(...found);
      repaired += fixed;
    }

    const report: ReconciliationReport = { checked: canonicalIds.size, issues };
    if (repair) report.repaired = repaired;
    this.log("info", "reconcile complete", { checked: report.checked, issueCount: issues.length, repaired });
    return report;
  }

  // ---------------------------------------------------------------------
  // Backup / restore (spec sections 51-53, Phase 7)
  // ---------------------------------------------------------------------

  /**
   * Exports canonical memories (optionally with versions/relations/
   * conflicts) as a portable, JSON-shaped snapshot. See `MemoryExport`
   * docs (`@memorie/types`) for the JSONL mapping.
   */
  async export(options?: ExportOptions): Promise<MemoryExport> {
    const memories = await this.memoryStore.list({
      tenantId: options?.tenantId,
      namespace: options?.namespace,
      subjectId: options?.subjectId,
    });

    const result: MemoryExport = {
      version: 1,
      exportedAt: this.clock().toISOString(),
      memories,
    };

    if (options?.includeVersions) {
      result.versions = (await Promise.all(memories.map((m) => this.versionStore.list(m.id)))).flat();
    }
    if (options?.includeRelations && this.graphStore?.listRelations) {
      const exportedIds = new Set(memories.map((m) => m.id));
      const allRelations = await this.graphStore.listRelations();
      result.relations = allRelations.filter(
        (r) => exportedIds.has(r.fromMemoryId) || exportedIds.has(r.toMemoryId),
      );
    }
    if (options?.includeConflicts && this.conflictStore) {
      const seen = new Map<string, NonNullable<MemoryExport["conflicts"]>[number]>();
      for (const memory of memories) {
        const conflicts = await this.conflictStore.list({ memoryId: memory.id });
        for (const conflict of conflicts) seen.set(conflict.id, conflict);
      }
      result.conflicts = [...seen.values()];
    }
    if (this.redact) {
      // Redact only the exported memory snapshots — ids used above for
      // scoping versions/relations/conflicts are untouched. Note: a
      // redacted export loses fidelity by design, so import()-ing it
      // back will not restore the original, un-redacted content.
      result.memories = memories.map((m) =>
        this.applyRedaction(m, {
          operation: "export",
          tenantId: options?.tenantId,
          namespace: options?.namespace,
          subjectId: options?.subjectId,
        }),
      );
    }

    this.log("info", "export complete", {
      count: memories.length,
      includeVersions: Boolean(options?.includeVersions),
      includeConflicts: Boolean(options?.includeConflicts),
    });
    return result;
  }

  /**
   * Imports a snapshot produced by export(). Re-runs every memory
   * through the normal, validated `add()` path (or `update()` on
   * conflict with `onConflict: "overwrite"`) so versioning/indexing stay
   * consistent — this is not a raw bulk-insert bypass.
   */
  async import(data: MemoryExport, options?: ImportOptions): Promise<ImportResult> {
    const onConflict = options?.onConflict ?? "skip";
    const result: ImportResult = { imported: 0, skipped: 0, versionsImported: 0, relationsImported: 0, conflictsImported: 0 };

    for (const memory of data.memories) {
      const existing = await this.memoryStore.get(memory.id);
      if (existing && onConflict === "skip") {
        result.skipped++;
        continue;
      }
      if (existing && onConflict === "overwrite") {
        await this.update(memory.id, {
          content: memory.content,
          importance: memory.importance,
          confidence: memory.confidence,
          metadata: memory.metadata,
        });
        result.imported++;
        continue;
      }
      await this.add({
        tenantId: memory.tenantId,
        namespace: memory.namespace,
        subjectId: memory.subjectId,
        type: memory.type,
        content: memory.content,
        importance: memory.importance,
        confidence: memory.confidence,
        source: memory.source,
        metadata: memory.metadata,
        expiresAt: memory.expiresAt,
      });
      result.imported++;
    }

    if (data.relations && this.graphStore) {
      for (const relation of data.relations) {
        await this.graphStore.createRelation(relation);
        result.relationsImported++;
      }
    }

    if (data.conflicts && this.conflictStore) {
      for (const conflict of data.conflicts) {
        await this.conflictStore.record(conflict);
        result.conflictsImported++;
      }
    }

    this.log("info", "import complete", result as unknown as Record<string, unknown>);
    return result;
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  /** Pages through every canonical memory. Used by reindex()/reconcile()/export() so none load the whole store into memory at once. */
  private async *iterateAllMemories(batchSize = 500): AsyncGenerator<Memory> {
    let offset = 0;
    for (;;) {
      const batch = await this.memoryStore.list({ limit: batchSize, offset });
      for (const memory of batch) yield memory;
      if (batch.length < batchSize) break;
      offset += batchSize;
    }
  }

  /** Shared drift-detection + optional repair logic for reconcile(). */
  private async diffAndRepair(
    store: ReconciliationIssue["store"],
    canonicalIds: Set<string>,
    projectedIds: Set<string>,
    repair: boolean,
    repairMissing: (id: string) => Promise<void>,
    repairOrphaned: (id: string) => Promise<void>,
  ): Promise<{ found: ReconciliationIssue[]; fixed: number }> {
    const found: ReconciliationIssue[] = [];
    let fixed = 0;

    for (const id of canonicalIds) {
      if (!projectedIds.has(id)) {
        found.push({ store, type: "missing", memoryId: id });
        if (repair) {
          await repairMissing(id);
          fixed++;
        }
      }
    }
    for (const id of projectedIds) {
      if (!canonicalIds.has(id)) {
        found.push({ store, type: "orphaned", memoryId: id });
        if (repair) {
          await repairOrphaned(id);
          fixed++;
        }
      }
    }
    return { found, fixed };
  }

  /**
   * Applies the configured redact() hook, if any, to a single memory
   * leaving via a read-path operation. Returns the memory unchanged
   * when no hook is configured.
   */
  private applyRedaction(memory: Memory, context: RedactionContext): Memory {
    return this.redact ? this.redact(memory, context) : memory;
  }

  /** Runs a configured authorization hook, throwing AuthorizationError on denial. No-ops when no hook is configured for this operation. */
  private async checkAuthorization(
    hook: AuthorizeFn | undefined,
    operation: "read" | "write" | "delete",
    scope: { tenantId?: string; namespace?: string; subjectId?: string; memoryId?: string },
  ): Promise<void> {
    if (!hook) return;
    const allowed = await hook({ operation, ...scope });
    if (!allowed) {
      throw new AuthorizationError(operation, { details: scope });
    }
  }

  /** Structured debug logging. Never includes memory `content` — see docs/SECURITY.md. */
  private log(level: "debug" | "info" | "warn" | "error", message: string, context?: Record<string, unknown>): void {
    this.logger?.[level](message, context);
  }

  private metric(kind: "increment" | "gauge" | "histogram", name: string, value?: number, tags?: Record<string, string>): void {
    if (!this.metrics) return;
    if (kind === "increment") this.metrics.increment(name, value, tags);
    else if (kind === "gauge") this.metrics.gauge(name, value ?? 0, tags);
    else this.metrics.histogram(name, value ?? 0, tags);
  }

  /**
   * Starts a span for a named operation. Without a configured Tracer this
   * returns a no-op Span so call sites never need to branch on whether
   * tracing is enabled — same pattern as log()/metric() above. Wrap the
   * operation body in try/finally and call span.end() in the finally,
   * recording exceptions via span.recordException() in the catch.
   */
  private startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
    return this.tracer?.startSpan(name, { attributes }) ?? NOOP_SPAN;
  }

  /** Transitions a memory to "superseded" or "merged", recording a version. Used by resolveConflict()/consolidate(). */
  private async markSuperseded(
    memory: Memory,
    byId: string,
    targetState: "superseded" | "merged",
    now: Date,
  ): Promise<Memory> {
    assertTransition(memory.state, targetState);
    const patch: Partial<Memory> = {
      state: targetState,
      updatedAt: now,
      version: memory.version + 1,
    };
    if (targetState === "superseded") {
      patch.supersededBy = byId;
    }
    const updated = await this.memoryStore.update(memory.id, patch);
    await this.recordVersion(updated, targetState);
    await this.invalidateCache(memory.id);
    return updated;
  }

  /** Cache key for a memory's canonical record. */
  private cacheKey(id: string): string {
    return `memory:${id}`;
  }

  /** Drops a stale cache entry after any write. Never overwrites the cache with a write's result directly — always invalidate and let the next read repopulate it, so a slow/failed write can never leave the cache ahead of canonical state. */
  private async invalidateCache(id: string): Promise<void> {
    if (!this.cacheStore) return;
    await this.cacheStore.delete(this.cacheKey(id));
  }

  /** Best-effort relation recording for evolution outcomes (contradicts/supersedes/derived_from). No-ops without a GraphStore. */
  private async linkGraph(fromMemoryId: string, toMemoryId: string, type: RelationType): Promise<void> {
    if (!this.graphStore) return;
    const relation: MemoryRelation = {
      id: this.idGenerator(),
      fromMemoryId,
      toMemoryId,
      type,
      createdAt: this.clock(),
    };
    await this.graphStore.createRelation(relation);
    this.events.emit("memory.relation_created", { relation });
  }

  private async indexEmbedding(memory: Memory): Promise<void> {
    // Both a VectorStore and an EmbeddingProvider must be configured:
    // the store alone has nothing to compute a vector with, and vice
    // versa. This keeps the core's zero-mandatory-AI-dependency property
    // (spec section 19) — nothing here runs unless the caller opted in
    // to both.
    if (!this.vectorStore || !this.embeddingProvider) return;
    const embedding = await this.embeddingProvider.embed(memory.content);
    await this.vectorStore.upsert(memory.id, embedding, {
      tenantId: memory.tenantId,
      namespace: memory.namespace,
      subjectId: memory.subjectId,
    });
  }

  private async recordVersion(
    memory: Memory,
    changeType: MemoryVersion["changeType"],
    reason?: string,
  ): Promise<void> {
    const version: MemoryVersion = {
      memoryId: memory.id,
      version: memory.version,
      snapshot: memory,
      changeType,
      // Use the memory's own updatedAt rather than calling this.clock() again,
      // so the version timestamp always matches the state it captures even
      // under a custom/stepped clock (e.g. in tests).
      createdAt: memory.updatedAt,
      reason,
    };
    await this.versionStore.append(version);
    this.events.emit("memory.version_created", { memoryId: memory.id, version: memory.version });
  }
}

export function createMemoryEngine(config: MemoryEngineConfig): MemoryEngine {
  return new MemoryEngine(config);
}
