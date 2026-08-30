// Run after `npm run build` from the repo root:
//   node examples/02-inmemory/index.mjs
//
// Shows multi-tenant scoping and listing/filtering with the InMemoryStore.
// Note the domain here is "devices" and "organizations" -- Memorie's
// subjectId/namespace concept is not tied to users or chat.

import { createMemoryEngine } from "../../packages/core/dist/index.js";
import { InMemoryStore, InMemoryVersionStore } from "../../packages/storage-memory/dist/index.js";

const memory = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
});

await memory.add({
  tenantId: "org_acme",
  namespace: "devices",
  subjectId: "device_001",
  type: "event",
  content: "Firmware updated to v2.3.1.",
  importance: 0.4,
});

await memory.add({
  tenantId: "org_acme",
  namespace: "devices",
  subjectId: "device_001",
  type: "fact",
  content: "Located in warehouse B, aisle 12.",
  importance: 0.3,
});

await memory.add({
  tenantId: "org_other",
  namespace: "devices",
  subjectId: "device_001", // same subjectId, different tenant -- must not collide
  type: "fact",
  content: "Belongs to a different organization entirely.",
});

const acmeDeviceMemories = await memory.list({
  tenantId: "org_acme",
  namespace: "devices",
  subjectId: "device_001",
});
console.log(`org_acme/device_001 has ${acmeDeviceMemories.length} memories:`);
for (const m of acmeDeviceMemories) console.log(" -", m.type, ":", m.content);

const factsOnly = await memory.list({
  tenantId: "org_acme",
  namespace: "devices",
  subjectId: "device_001",
  filters: { type: "fact" },
});
console.log(`filtered to type="fact": ${factsOnly.length} memories`);
