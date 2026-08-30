import type { NewMemoryInput, MemoryPatch } from "@memorie/types";
import { ValidationError } from "@memorie/types";

function assertUnitInterval(value: number | undefined, field: string): void {
  if (value === undefined) return;
  if (Number.isNaN(value) || value < 0 || value > 1) {
    throw new ValidationError(`${field} must be between 0.0 and 1.0, got ${value}`);
  }
}

export function validateNewMemoryInput(input: NewMemoryInput): void {
  if (!input.namespace || input.namespace.trim() === "") {
    throw new ValidationError("namespace is required");
  }
  if (!input.subjectId || input.subjectId.trim() === "") {
    throw new ValidationError("subjectId is required");
  }
  if (!input.type || input.type.trim() === "") {
    throw new ValidationError("type is required");
  }
  if (input.content === undefined || input.content === null || input.content === "") {
    throw new ValidationError("content is required");
  }
  assertUnitInterval(input.importance, "importance");
  assertUnitInterval(input.confidence, "confidence");
}

export function validateMemoryPatch(patch: MemoryPatch): void {
  assertUnitInterval(patch.importance, "importance");
  assertUnitInterval(patch.confidence, "confidence");
  if (patch.content !== undefined && patch.content === "") {
    throw new ValidationError("content cannot be set to an empty string");
  }
}
