export interface MemorieErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

/** Base class for all errors raised by Memorie. */
export class MemorieError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, options: MemorieErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MemoryNotFoundError extends MemorieError {
  constructor(memoryId: string, options?: MemorieErrorOptions) {
    super(`Memory not found: ${memoryId}`, "MEMORY_NOT_FOUND", options);
  }
}

export class MemoryConflictError extends MemorieError {
  constructor(message: string, options?: MemorieErrorOptions) {
    super(message, "MEMORY_CONFLICT", options);
  }
}

export class StorageError extends MemorieError {
  constructor(message: string, options?: MemorieErrorOptions) {
    super(message, "STORAGE_ERROR", options);
  }
}

export class SearchError extends MemorieError {
  constructor(message: string, options?: MemorieErrorOptions) {
    super(message, "SEARCH_ERROR", options);
  }
}

export class VectorStoreError extends MemorieError {
  constructor(message: string, options?: MemorieErrorOptions) {
    super(message, "VECTOR_STORE_ERROR", options);
  }
}

export class GraphStoreError extends MemorieError {
  constructor(message: string, options?: MemorieErrorOptions) {
    super(message, "GRAPH_STORE_ERROR", options);
  }
}

export class ValidationError extends MemorieError {
  constructor(message: string, options?: MemorieErrorOptions) {
    super(message, "VALIDATION_ERROR", options);
  }
}

export class TenantIsolationError extends MemorieError {
  constructor(message: string, options?: MemorieErrorOptions) {
    super(message, "TENANT_ISOLATION_ERROR", options);
  }
}

export class ConcurrencyError extends MemorieError {
  constructor(message: string, options?: MemorieErrorOptions) {
    super(message, "CONCURRENCY_ERROR", options);
  }
}

export class VersionConflictError extends ConcurrencyError {
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(memoryId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Version conflict for memory ${memoryId}: expected version ${expectedVersion}, actual version ${actualVersion}`,
      { details: { memoryId, expectedVersion, actualVersion } },
    );
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class UnsupportedCapabilityError extends MemorieError {
  constructor(capability: string, options?: MemorieErrorOptions) {
    super(`Capability not supported by configured adapters: ${capability}`, "UNSUPPORTED_CAPABILITY", options);
  }
}

export class InvalidStateTransitionError extends MemorieError {
  constructor(from: string, to: string, options?: MemorieErrorOptions) {
    super(`Invalid memory lifecycle transition: ${from} -> ${to}`, "INVALID_STATE_TRANSITION", options);
  }
}

/** Thrown when a configured authorizeRead/authorizeWrite/authorizeDelete hook denies an operation (spec section 43). */
export class AuthorizationError extends MemorieError {
  constructor(operation: string, options?: MemorieErrorOptions) {
    super(`Not authorized to perform "${operation}"`, "AUTHORIZATION_ERROR", options);
  }
}
