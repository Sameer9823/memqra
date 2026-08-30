/**
 * Very small, dependency-free keyword relevance score in [0, 1].
 * Used only as the fallback signal when no SearchStore/VectorStore is
 * configured (spec section 49, graceful degradation). Real deployments
 * should plug in a SearchStore (e.g. Elasticsearch) for proper full-text
 * relevance.
 */
export function keywordScore(content: string, query: string | undefined): number {
  if (!query) return 0;
  const normalizedContent = content.toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return 0;

  let matched = 0;
  for (const term of terms) {
    if (normalizedContent.includes(term)) matched += 1;
  }
  return matched / terms.length;
}
