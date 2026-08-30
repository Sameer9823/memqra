import { Database, GitBranch, Network, SearchCode, Zap } from "lucide-react";

const PROJECTIONS = [
  { icon: SearchCode, label: "Search index" },
  { icon: Zap, label: "Vector index" },
  { icon: Network, label: "Graph" },
  { icon: GitBranch, label: "Cache" },
];

export function ArchitectureDiagram() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-raised)] px-6 py-9 sm:px-10">
      <div className="flex flex-col items-center">
        {/* Canonical store */}
        <div className="relative flex items-center gap-2.5 rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg-raised))] px-4 py-2.5 shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_8%,transparent)]">
          <Database size={15} className="shrink-0 text-[var(--accent)]" strokeWidth={2} />
          <div className="leading-tight">
            <div className="font-mono text-[12.5px] font-medium text-[var(--text)]">
              MemoryStore
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)]">
              canonical · authoritative
            </div>
          </div>
        </div>

        {/* stem */}
        <div className="h-6 w-px bg-[var(--border-strong)]" />

        {/* bus + projections */}
        <div className="inline-flex flex-wrap justify-center gap-x-4 gap-y-6 border-t border-dashed border-[var(--border-strong)] pt-6">
          {PROJECTIONS.map((p) => (
            <div key={p.label} className="flex flex-col items-center">
              <div className="h-4 w-px bg-[var(--border-strong)]" />
              <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--bg-inset)] px-3 py-2">
                <p.icon size={13} className="shrink-0 text-[var(--text-faint)]" strokeWidth={1.75} />
                <span className="font-mono text-[11.5px] text-[var(--text-muted)]">{p.label}</span>
              </div>
              <span className="mt-1.5 font-mono text-[9.5px] uppercase tracking-wider text-[var(--text-faint)]">
                optional
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-7 border-t border-[var(--border)] pt-5 text-center font-mono text-[11.5px] leading-relaxed text-[var(--text-faint)]">
        Solid = source of truth. Dashed = rebuildable from it at any time.
      </p>
    </div>
  );
}