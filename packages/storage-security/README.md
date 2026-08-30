# @memorie/storage-security

Encryption-at-rest for Memorie: a `MemoryStore` decorator plus a
dependency-free AES-256-GCM `Cipher`, built entirely on Node's built-in
`node:crypto` — no external crypto dependency.

## Install

```bash
npm install @memorie/storage-security
```

## What's inside

- **`AesGcmCipher`** — a dependency-free `Cipher` implementation using AES-256-GCM (authenticated encryption) via `node:crypto`.
- **`EncryptedMemoryStore`** — a `MemoryStore` decorator that wraps *any* other `MemoryStore` and transparently encrypts memory content before it's written, decrypting on read.

## Usage

```ts
import { AesGcmCipher, EncryptedMemoryStore } from "@memorie/storage-security";
import { InMemoryStore } from "@memorie/storage-memory";
import { createMemoryEngine } from "@memorie/core";

const cipher = new AesGcmCipher(process.env.MEMORIE_ENCRYPTION_KEY!); // 32-byte key, or a Buffer

const encryptedStore = new EncryptedMemoryStore(new InMemoryStore(), {
  cipher,
});

const engine = createMemoryEngine({ memoryStore: encryptedStore });
```

Because `EncryptedMemoryStore` wraps another `MemoryStore`, it composes with
any backend — swap `InMemoryStore` above for
[`SqliteStore`](../storage-sqlite) or
[`PostgresStore`](../storage-postgres) to get encryption at rest on top of a
durable backend.

## Key management

`AesGcmCipher` takes the encryption key directly — this package doesn't
handle key generation, rotation, or storage (e.g. KMS/Vault integration).
Treat the key with the same care as any other secret: load it from your
existing secrets manager or environment configuration, never hardcode it.

## Related packages

- [`@memorie/storage`](../storage) — the `MemoryStore` interface this decorator implements.
- [`@memorie/storage-memory`](../storage-memory) — used in this package's own tests as the wrapped store.
- [`@memorie/core`](../core) — the engine that consumes the resulting store.

Part of the [Memorie](../../README.md) monorepo.
