# @memorie/cache-redis

Redis `CacheStore` adapter for Memorie, built on
[`redis`](https://www.npmjs.com/package/redis) (node-redis v6). Speeds up
repeated reads by caching memories in front of your primary `MemoryStore`.

## Install

```bash
npm install @memorie/cache-redis
```

Requires a running Redis instance (developed/tested against Redis 7).

## What's inside

- **`RedisCacheStore`** — a `CacheStore` implementation that JSON-serializes memories into Redis, with configurable TTL.

## Usage

```ts
import { createClient } from "redis";
import { RedisCacheStore } from "@memorie/cache-redis";
import { InMemoryStore } from "@memorie/storage-memory";
import { createMemoryEngine } from "@memorie/core";

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const engine = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  cacheStore: new RedisCacheStore(redisClient),
});
```

`RedisCacheStore` also accepts a connection URL string directly instead of a
pre-built client:

```ts
new RedisCacheStore(process.env.REDIS_URL!);
```

## A note on dates

Redis stores everything as strings/JSON, so `Date` fields on a cached
`Memory` come back as ISO strings rather than `Date` instances.
[`@memorie/core`](../core)'s `MemoryEngine` already accounts for this and
revives dates on any cache read — you generally don't need to think about
it unless you're reading directly from `RedisCacheStore` outside the engine.

## Related packages

- [`@memorie/storage`](../storage) — the `CacheStore` interface this package implements.
- [`@memorie/core`](../core) — the engine that consumes this store.

Part of the [Memorie](../../README.md) monorepo.
