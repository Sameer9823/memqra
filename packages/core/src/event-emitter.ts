import type { MemorieEventMap, MemorieEventName } from "@memorie/types";

type Handler<K extends MemorieEventName> = (payload: MemorieEventMap[K]) => void;

/**
 * Minimal typed event emitter. Deliberately not Node's EventEmitter so
 * this package stays runtime-agnostic (works in browsers/edge runtimes too).
 */
export class MemorieEventEmitter {
  private readonly handlers = new Map<MemorieEventName, Set<Handler<MemorieEventName>>>();

  on<K extends MemorieEventName>(event: K, handler: Handler<K>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as Handler<MemorieEventName>);
    this.handlers.set(event, set);
    return () => this.off(event, handler);
  }

  off<K extends MemorieEventName>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler as Handler<MemorieEventName>);
  }

  emit<K extends MemorieEventName>(event: K, payload: MemorieEventMap[K]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}
