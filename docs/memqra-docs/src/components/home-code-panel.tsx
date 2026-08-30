import { highlight } from "@/lib/highlight";

const SNIPPET = `import { createMemoryEngine } from "@memorie/core";
import { InMemoryStore, InMemoryVersionStore } from "@memorie/storage-memory";

const memory = createMemoryEngine({
  memoryStore: new InMemoryStore(),
  versionStore: new InMemoryVersionStore(),
});

const m1 = await memory.add({
  namespace: "users",
  subjectId: "user_123",
  type: "preference",
  content: "Prefers TypeScript.",
});

await memory.evolve(m1.id, {
  content: "Prefers TypeScript for application development.",
});

const history = await memory.history(m1.id);
const asOf = await memory.getAt(m1.id, new Date("2026-04-01"));`;

export async function HomeCodePanel() {
  const html = await highlight(SNIPPET, "ts");
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--code-bg)]">
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
        <span className="ml-2 font-mono text-[11px] text-[var(--text-faint)]">index.ts</span>
      </div>
      <div
        className="overflow-x-auto p-4 text-[13px] leading-relaxed [&_pre]:!bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
