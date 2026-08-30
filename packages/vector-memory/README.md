# @memorie/vector-memory

In-memory brute-force cosine-similarity `VectorStore` for Memorie. Reference
implementation, used in this monorepo's own tests, and suitable for
small-scale local semantic search — nothing persists to disk, and search is
O(n) over stored vectors.

## Install

```bash
npm install @memorie/vector-memory
```

## What's inside

- **`InMemoryVectorStore`** — a `VectorStore` implementation that stores vectors in memory and finds nearest neighbors via brute-force cosine similarity.

## Usage

```ts
import { InMemoryVectorStore } from "@memorie/vector-memory";
import { HashEmbeddingProvider } from "@memorie/embeddings";
import { InMemoryStore } from "@memorie/storage-memory";
import { createMemoryEngine } from "@memorie/core";

const engine = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  vectorStore: new InMemoryVectorStore(),
  embeddingProvider: new HashEmbeddingProvider(),
});

const results = await engine.search({ query: "what does the user like?" });
```

## When to reach for something else

Brute-force cosine similarity is fine for small memory sets (tests, demos,
single-user local apps) but doesn't scale to large collections the way an
indexed vector database (pgvector, Pinecone, Qdrant, etc.) would. This
package intentionally stays dependency-free as the reference `VectorStore`
implementation — for production-scale semantic search, implement the
`VectorStore` interface from [`@memorie/storage`](../storage) against your
vector database of choice.

## Related packages

- [`@memorie/storage`](../storage) — the `VectorStore` interface this package implements.
- [`@memorie/embeddings`](../embeddings) — pairs with this to actually generate the vectors being stored.
- [`@memorie/search-sqlite`](../search-sqlite) — keyword-search counterpart; `@memorie/core` combines both via hybrid search.
- [`@memorie/core`](../core) — the engine that consumes this store.

Part of the [Memorie](../../README.md) monorepo.
