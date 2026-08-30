import { describe, it, expect } from "vitest";
import { recencyScore, frequencyScore } from "../src/ranking.js";

describe("recencyScore", () => {
  it("is 1.0 for a memory updated right now", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(recencyScore(now, now)).toBeCloseTo(1.0, 5);
  });

  it("decays as age increases", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    const recent = new Date("2026-01-30T00:00:00Z");
    const old = new Date("2025-06-01T00:00:00Z");
    expect(recencyScore(recent, now)).toBeGreaterThan(recencyScore(old, now));
  });

  it("never goes negative for future timestamps (clamped age)", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const future = new Date("2026-06-01T00:00:00Z");
    expect(recencyScore(future, now)).toBeLessThanOrEqual(1.0);
    expect(recencyScore(future, now)).toBeGreaterThanOrEqual(0);
  });
});

describe("frequencyScore", () => {
  it("is 0 for a never-accessed memory", () => {
    expect(frequencyScore(0)).toBe(0);
  });

  it("increases with access count but has diminishing returns", () => {
    const low = frequencyScore(2);
    const high = frequencyScore(1000);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
  });
});
