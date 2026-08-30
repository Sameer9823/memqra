/**
 * Provider-independent observability interfaces (spec section 59).
 * The core never depends on a concrete logging/metrics vendor — plug in
 * whatever you already use (pino, winston, StatsD, Prometheus,
 * OpenTelemetry, ...) by implementing these small interfaces.
 *
 * Per spec section 43/59: implementations of these should not assume
 * it's safe to log full memory contents. The engine itself never passes
 * `content` in the `context` it logs — only ids/scope/counts — so a
 * naive Logger implementation stays safe by default.
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * A minimal metrics facade covering counters, gauges, and histograms —
 * the three shapes needed for the metrics named in spec section 59
 * (creation/update rate, retrieval/search latency, cache hit/miss rate,
 * conflict/consolidation rate).
 */
export interface MetricsProvider {
  /** Increments a counter, e.g. "memorie.memory.created". */
  increment(name: string, value?: number, tags?: Record<string, string>): void;
  /** Records a point-in-time value, e.g. a queue depth. */
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  /** Records a distribution sample, e.g. a latency in milliseconds. */
  histogram(name: string, value: number, tags?: Record<string, string>): void;
}

/**
 * A single unit of work within a trace. Returned by Tracer.startSpan();
 * callers must call end() exactly once, typically in a finally block.
 * Deliberately minimal — enough to map onto OpenTelemetry, Datadog APM,
 * or a test double without forcing a shape on any of them.
 */
export interface Span {
  /** Attaches or overwrites an attribute on the span. */
  setAttribute(key: string, value: string | number | boolean): void;
  /** Records that the span's operation failed. Does not end the span. */
  recordException(error: unknown): void;
  /** Ends the span. Call exactly once; further calls are ignored. */
  end(): void;
}

/**
 * Provider-independent distributed tracing (spec section 59), following
 * the same optional/no-op-when-unconfigured pattern as Logger and
 * MetricsProvider above. Plug in an OpenTelemetry, Datadog, or other APM
 * tracer by implementing this and Span.
 */
export interface Tracer {
  /**
   * Starts a new span for a named operation (e.g. "memorie.search").
   * `parent`, when supplied, lets the underlying tracer nest this span
   * under an in-flight one instead of starting a new root trace —
   * useful when a caller wraps its own outer span around several engine
   * calls. Implementations without nested-span support may ignore it.
   */
  startSpan(name: string, options?: { attributes?: Record<string, string | number | boolean>; parent?: Span }): Span;
}
