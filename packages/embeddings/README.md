# @memorie/embeddings

Optional, dependency-free `EmbeddingProvider` implementations for Memorie.
No AI vendor dependency — this package doesn't call out to OpenAI,
Anthropic, or any other embedding API.

## Install

```bash
npm install @memorie/embeddings
```

## What's inside

- **`HashEmbeddingProvider`** — a deterministic, hash-based `EmbeddingProvider`. It doesn't produce semantically meaningful embeddings the way a trained model would, but it's fast, free, has zero external dependencies, and is useful for tests, local development, and demos of the vector-search pipeline without needing an API key.

## Usage

```ts
import { HashEmbeddingProvider } from "@memorie/embeddings";
import { InMemoryVectorStore } from "@memorie/vector-memory";
import { InMemoryStore } from "@memorie/storage-memory";
import { createMemoryEngine } from "@memorie/core";

const engine = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  vectorStore: new InMemoryVectorStore(),
  embeddingProvider: new HashEmbeddingProvider(), // default 384 dimensions
});
```

`HashEmbeddingProvider` takes an optional `dimensions` argument
(`new HashEmbeddingProvider(768)`) if you need to match a specific vector
size.

## Using a real embedding model instead

For production semantic search, you'll typically want a trained embedding
model rather than `HashEmbeddingProvider`. Memorie's `EmbeddingProvider`
interface (from [`@memorie/types`](../types)) is intentionally small —
implement it against your provider of choice (OpenAI, Cohere, a local
model, etc.) and pass your implementation into `createMemoryEngine()` the
same way.

## Related packages

- [`@memorie/types`](../types) — defines the `EmbeddingProvider` interface this package implements.
- [`@memorie/vector-memory`](../vector-memory) — the `VectorStore` this pairs with.
- [`@memorie/core`](../core) — the engine that consumes an `embeddingProvider`.

Part of the [Memorie](../../README.md) monorepo.
