import type { MemoryScope } from "./query.js";
import type { Memory } from "./memory.js";

export type AuthorizationOperation = "read" | "write" | "delete";

export interface AuthorizationContext extends MemoryScope {
  operation: AuthorizationOperation;
  /** Set for operations on a specific, already-known memory (get/update/delete); absent for scope-level operations (list/search/add). */
  memoryId?: string;
}

/**
 * Authorization hook (spec section 43). Return (or resolve to) `false`
 * to deny the operation — the engine throws `AuthorizationError` and
 * performs no store mutation or read. The engine calls these hooks
 * before any store access, so a synchronous `false` short-circuits
 * before canonical or secondary stores are ever touched.
 */
export type AuthorizeFn = (context: AuthorizationContext) => boolean | Promise<boolean>;

/** Read-path operations a Redactor can be invoked for. */
export type RedactionOperation = "get" | "recall" | "list" | "search" | "export";

export interface RedactionContext extends MemoryScope {
  operation: RedactionOperation;
}

/**
 * Redaction hook (design brief: a redaction mechanism independent of
 * logging, e.g. masking specific fields before they leave the process).
 * Distinct from `AuthorizeFn`: authorization is all-or-nothing (deny the
 * whole read), redaction lets a memory through while masking parts of
 * it — e.g. blanking `content` or stripping a `metadata` key for
 * callers who shouldn't see the raw value but are otherwise allowed to
 * know the memory exists.
 *
 * Must return a new object rather than mutating `memory` — the engine
 * may reuse the same in-memory `Memory` for a cache write or a second
 * caller, so mutating it in place would leak the redaction (or the
 * un-redacted original) across callers.
 */
export type RedactFn = (memory: Memory, context: RedactionContext) => Memory;
