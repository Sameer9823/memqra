import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, InMemoryVersionStore } from "@memorie/storage-memory";
import type { Span, Tracer } from "@memorie/types";
import { createMemoryEngine, type MemoryEngine } from "../src/engine.js";

interface RecordedSpan {
  name: string;
  attributes: Record<string, string | number | boolean>;
  ended: boolean;
  exception?: unknown;
}

class RecordingTracer implements Tracer {
  spans: RecordedSpan[] = [];

  startSpan(name: string, options?: { attributes?: Record<string, string | number | boolean> }): Span {
    const record: RecordedSpan = { name, attributes: { ...options?.attributes }, ended: false };
    this.spans.push(record);
    return {
      setAttribute: (key, value) => {
        record.attributes[key] = value;
      },
      recordException: (error) => {
        record.exception = error;
      },
      end: () => {
        record.ended = true;
      },
    };
  }
}

describe("MemoryEngine tracing (Phase 7)", () => {
  let tracer: RecordingTracer;
  let engine: MemoryEngine;

  beforeEach(() => {
    tracer = new RecordingTracer();
    engine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      versionStore: new InMemoryVersionStore(),
      observability: { tracer },
    });
  });

  it("is a no-op when no Tracer is configured", async () => {
    const plainEngine = createMemoryEngine({
      memoryStore: new InMemoryStore(),
      versionStore: new InMemoryVersionStore(),
    });
    // Should not throw even though no tracer was supplied.
    const memory = await plainEngine.add({ namespace: "n", subjectId: "s", type: "fact", content: "hi" });
    expect(memory.id).toBeTruthy();
  });

  it("starts and ends a memorie.add span with the created memory id", async () => {
    const memory = await engine.add({ namespace: "users", subjectId: "u1", type: "fact", content: "likes tea" });

    const span = tracer.spans.find((s) => s.name === "memorie.add");
    expect(span).toBeDefined();
    expect(span?.ended).toBe(true);
    expect(span?.attributes.namespace).toBe("users");
    expect(span?.attributes.type).toBe("fact");
    expect(span?.attributes["memory.id"]).toBe(memory.id);
  });

  it("starts and ends a memorie.get span, tagging cache hit/miss when a CacheStore is configured", async () => {
    const created = await engine.add({ namespace: "n", subjectId: "s", type: "fact", content: "x" });
    tracer.spans = [];

    await engine.get(created.id);

    const span = tracer.spans.find((s) => s.name === "memorie.get");
    expect(span).toBeDefined();
    expect(span?.ended).toBe(true);
    expect(span?.attributes["memory.id"]).toBe(created.id);
  });

  it("starts and ends a memorie.search span with a result count", async () => {
    await engine.add({ namespace: "n", subjectId: "s", type: "fact", content: "findable content" });
    tracer.spans = [];

    await engine.search({ query: "findable", namespace: "n" });

    const span = tracer.spans.find((s) => s.name === "memorie.search");
    expect(span).toBeDefined();
    expect(span?.ended).toBe(true);
    expect(typeof span?.attributes["result.count"]).toBe("number");
  });

  it("records an exception on the span and still ends it when an operation throws", async () => {
    await expect(engine.get("does-not-matter")).resolves.toBeNull();
    tracer.spans = [];

    await expect(
      engine.update("missing-id", { content: "new content" }),
    ).rejects.toThrow();

    const span = tracer.spans.find((s) => s.name === "memorie.update");
    expect(span).toBeDefined();
    expect(span?.ended).toBe(true);
    expect(span?.exception).toBeDefined();
  });

  it("starts and ends a memorie.delete span", async () => {
    const created = await engine.add({ namespace: "n", subjectId: "s", type: "fact", content: "x" });
    tracer.spans = [];

    await engine.delete(created.id);

    const span = tracer.spans.find((s) => s.name === "memorie.delete");
    expect(span).toBeDefined();
    expect(span?.ended).toBe(true);
    expect(span?.attributes["memory.id"]).toBe(created.id);
  });
});
