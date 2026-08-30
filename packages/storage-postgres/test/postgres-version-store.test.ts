import { describe, it, expect, beforeEach } from "vitest";
import { Pool } from "pg";
import type { Memory, MemoryVersion } from "@memorie/types";
import { PostgresVersionStore } from "../src/postgres-version-store.js";
import { CREATE_MEMORIES_TABLE } from "../src/schema.js";

const connectionString =
  process.env.MEMORIE_TEST_POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/memorie_test";

const pool = new Pool({ connectionString });

function snapshot(overrides: Partial<Memory> = {}): Memory {
  const now = new Date();
  return {
    id: overrides.id ?? "m1",
    namespace: "users",
    subjectId: "u1",
    type: "fact",
    content: overrides.content ?? "hello",
    state: "active",
    importance: 0.5,
    confidence: 0.5,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    version: overrides.version ?? 1,
    ...overrides,
  };
}

describe("PostgresVersionStore", () => {
  let store: PostgresVersionStore;

  beforeEach(async () => {
    await pool.query(CREATE_MEMORIES_TABLE);
    store = new PostgresVersionStore(pool);
    await store.init();
    await pool.query("TRUNCATE memory_versions");
  });

  it("appends and lists versions in order", async () => {
    const v1: MemoryVersion = {
      memoryId: "m1",
      version: 1,
      changeType: "created",
      snapshot: snapshot({ version: 1, content: "v1" }),
      createdAt: new Date(Date.now() - 1000),
    };
    const v2: MemoryVersion = {
      memoryId: "m1",
      version: 2,
      changeType: "updated",
      snapshot: snapshot({ version: 2, content: "v2" }),
      createdAt: new Date(),
    };
    await store.append(v1);
    await store.append(v2);

    const versions = await store.list("m1");
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions[0]?.snapshot.content).toBe("v1");
    expect(versions[0]?.snapshot.createdAt).toBeInstanceOf(Date);
  });

  it("get() returns a specific version", async () => {
    await store.append({
      memoryId: "m1",
      version: 1,
      changeType: "created",
      snapshot: snapshot({ version: 1 }),
      createdAt: new Date(),
    });
    const found = await store.get("m1", 1);
    expect(found?.version).toBe(1);
    const missing = await store.get("m1", 99);
    expect(missing).toBeNull();
  });

  it("getAt() returns the version current at a timestamp", async () => {
    const t1 = new Date(Date.now() - 2000);
    const t2 = new Date();
    await store.append({
      memoryId: "m1",
      version: 1,
      changeType: "created",
      snapshot: snapshot({ version: 1 }),
      createdAt: t1,
    });
    await store.append({
      memoryId: "m1",
      version: 2,
      changeType: "updated",
      snapshot: snapshot({ version: 2 }),
      createdAt: t2,
    });

    const between = await store.getAt("m1", new Date(t1.getTime() + 500));
    expect(between?.version).toBe(1);
    const after = await store.getAt("m1", new Date(t2.getTime() + 500));
    expect(after?.version).toBe(2);
    const before = await store.getAt("m1", new Date(t1.getTime() - 500));
    expect(before).toBeNull();
  });

  it("deleteAll() removes every version for a memory", async () => {
    await store.append({
      memoryId: "m1",
      version: 1,
      changeType: "created",
      snapshot: snapshot(),
      createdAt: new Date(),
    });
    await store.deleteAll("m1");
    expect(await store.list("m1")).toHaveLength(0);
  });
});
