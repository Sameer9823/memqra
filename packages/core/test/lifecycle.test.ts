import { describe, it, expect } from "vitest";
import { canTransition, assertTransition } from "../src/lifecycle.js";
import { InvalidStateTransitionError } from "@memorie/types";

describe("lifecycle state machine", () => {
  it("allows active -> updated, archived, expired, superseded, merged, deleted", () => {
    for (const to of ["updated", "archived", "expired", "superseded", "merged", "deleted"] as const) {
      expect(canTransition("active", to)).toBe(true);
    }
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransition("deleted", "active")).toBe(false);
    expect(canTransition("superseded", "active")).toBe(false);
  });

  it("allows archived -> active (reactivation)", () => {
    expect(canTransition("archived", "active")).toBe(true);
  });

  it("assertTransition throws InvalidStateTransitionError on invalid transitions", () => {
    expect(() => assertTransition("deleted", "active")).toThrow(InvalidStateTransitionError);
  });

  it("assertTransition is a no-op for identical states", () => {
    expect(() => assertTransition("active", "active")).not.toThrow();
  });
});
