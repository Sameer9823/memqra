const RECENCY_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** Exponential recency decay in [0, 1]; 1.0 = updated right now. */
export function recencyScore(updatedAt: Date, now: Date): number {
  const ageMs = Math.max(0, now.getTime() - updatedAt.getTime());
  return Math.exp((-Math.LN2 * ageMs) / RECENCY_HALF_LIFE_MS);
}

/** Diminishing-returns access-frequency score in [0, 1]. */
export function frequencyScore(accessCount: number): number {
  return Math.min(1, Math.log2(accessCount + 1) / 10);
}
