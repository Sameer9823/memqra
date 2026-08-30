import { runMemoryStoreContractTests } from "@memorie/storage/contract-tests";
import { InMemoryStore } from "@memorie/storage-memory";
import { AesGcmCipher } from "../src/cipher.js";
import { EncryptedMemoryStore } from "../src/encrypted-memory-store.js";

runMemoryStoreContractTests(
  "EncryptedMemoryStore(InMemoryStore)",
  () => new EncryptedMemoryStore(new InMemoryStore(), { cipher: new AesGcmCipher(AesGcmCipher.generateKey()) }),
);
