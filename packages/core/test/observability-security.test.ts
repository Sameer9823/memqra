import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, InMemoryVersionStore } from "@memorie/storage-memory";
import { AuthorizationError } from "@memorie/types";
import { createMemoryEngine, type MemoryEngine } from "../src/engine.js";

class RecordingLogger {
  entries: { level: string; message: string; context?: Record<string, unknown> }[] = [];
  debug(message: string, context?: Record<string, unknown>) {
    this.entries.push({ level: "debug", message, context });
  }
  info(message: string, context?: Record<string, unknown>) {
    this.entries.push({ level: "info", message, context });
  }
  warn(message: string, context?: Record<string, unknown>) {
    this.entries.push({ level: "warn", message, context });
  }
  error(message: string, context?: Record<string, unknown>) {
    this.entries.push({ level: "error", message, context });
  }
}

class RecordingMetrics {
  increments: { name: string; value?: number; tags?: Record<string, string> }[] = [];
  gauges: { name: string; value: number }[] = [];
  histograms: { name: string; value: number }[] = [];
  increment(name: string, value?: number, tags?: Record<string, string>) {
    this.increments.push({ name, value, tags });
  }
  gauge(name: string, value: number) {
    this.gauges.push({ name, value });
  }
  histogram(name: string, value: number) {
    this.histograms.push({ name, value });
  }
}

describe("MemoryEngine observability (Phase 7)", () => {
  let logger: RecordingLogger;
  let metrics: RecordingMetrics;
  let engine: MemoryEngine;

  beforeEach(() => {
    logger = new RecordingLogger();
    metrics = new RecordingMetrics();
    engine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      versionStore: new InMemoryVersionStore(),
      observability: { logger, metrics },
    });
  });

  it("emits a memorie.memory.created counter and a debug log without memory content", async () => {
    const memory = await engine.add({
      namespace: "users",
      subjectId: "u1",
      type: "fact",
      content: "a secret detail nobody should see in logs",
    });

    expect(metrics.increments.some((i) => i.name === "memorie.memory.created")).toBe(true);
    const createdLog = logger.entries.find((e) => e.message === "memory created");
    expect(createdLog?.context?.id).toBe(memory.id);
    expect(JSON.stringify(createdLog?.context)).not.toContain("secret");
  });

  it("emits cache hit/miss counters and get latency histogram", async () => {
    const { InMemoryCacheStore } = await import("@memorie/storage-memory");
    engine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      versionStore: new InMemoryVersionStore(),
      cacheStore: new InMemoryCacheStore(),
      observability: { logger, metrics },
    });
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" });

    await engine.get(memory.id); // miss
    await engine.get(memory.id); // hit

    expect(metrics.increments.filter((i) => i.name === "memorie.cache.miss")).toHaveLength(1);
    expect(metrics.increments.filter((i) => i.name === "memorie.cache.hit")).toHaveLength(1);
    expect(metrics.histograms.some((h) => h.name === "memorie.get.latency_ms")).toBe(true);
  });

  it("emits a search latency histogram", async () => {
    await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hello world" });
    await engine.search({ namespace: "users", subjectId: "u1", query: "hello" });
    expect(metrics.histograms.some((h) => h.name === "memorie.search.latency_ms")).toBe(true);
  });

  it("does nothing (no error) when no logger/metrics are configured", async () => {
    const plainEngine = createMemoryEngine({ memoryStore: new InMemoryStore() });
    await expect(
      plainEngine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" }),
    ).resolves.toBeTruthy();
  });
});

describe("MemoryEngine authorization hooks (Phase 7)", () => {
  it("blocks add() when authorizeWrite returns false, and doesn't touch the store", async () => {
    const store = new InMemoryStore();
    const engine = createMemoryEngine({
      memoryStore: store,
      security: { authorizeWrite: () => false },
    });
    await expect(
      engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" }),
    ).rejects.toThrow(AuthorizationError);
    expect(await store.count()).toBe(0);
  });

  it("allows add() when authorizeWrite returns true", async () => {
    const engine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      security: { authorizeWrite: () => true },
    });
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" });
    expect(memory.id).toBeTruthy();
  });

  it("blocks get()/list()/search() when authorizeRead returns false", async () => {
    const engine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      security: { authorizeRead: () => false },
    });
    await expect(engine.get("whatever")).rejects.toThrow(AuthorizationError);
    await expect(engine.list({ namespace: "users" })).rejects.toThrow(AuthorizationError);
    await expect(engine.search({ namespace: "users", query: "x" })).rejects.toThrow(AuthorizationError);
  });

  it("blocks delete() when authorizeDelete returns false", async () => {
    const engine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      security: { authorizeWrite: () => true, authorizeDelete: () => false },
    });
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" });
    await expect(engine.delete(memory.id)).rejects.toThrow(AuthorizationError);
  });

  it("passes operation and scope context to the authorization hook", async () => {
    const calls: unknown[] = [];
    const engine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      security: {
        authorizeWrite: (ctx) => {
          calls.push(ctx);
          return true;
        },
      },
    });
    await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" });
    expect(calls).toEqual([{ operation: "write", namespace: "users", subjectId: "u1" }]);
  });

  it("supports an async authorization hook", async () => {
    const engine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      security: { authorizeWrite: async () => Promise.resolve(false) },
    });
    await expect(
      engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("proceeds without error when no authorization hooks are configured", async () => {
    const engine = createMemoryEngine({ memoryStore: new InMemoryStore() });
    await expect(
      engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "hi" }),
    ).resolves.toBeTruthy();
  });
});
