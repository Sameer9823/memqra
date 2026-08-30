import type { MemoryState } from "@memorie/types";
import { InvalidStateTransitionError } from "@memorie/types";

/**
 * Explicit lifecycle graph (see docs/MEMORY-LIFECYCLE.md). Invalid
 * transitions throw rather than silently succeeding, per spec section 12.
 */
const ALLOWED_TRANSITIONS: Record<MemoryState, MemoryState[]> = {
  active: ["updated", "archived", "expired", "superseded", "merged", "deleted"],
  updated: ["active", "archived", "expired", "superseded", "merged", "deleted"],
  archived: ["active", "deleted"],
  expired: ["archived", "deleted"],
  superseded: ["deleted"],
  merged: ["deleted"],
  deleted: [],
};

export function canTransition(from: MemoryState, to: MemoryState): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: MemoryState, to: MemoryState): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}
