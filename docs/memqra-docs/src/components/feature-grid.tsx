import Link from "next/link";
import {
  Layers,
  GitBranch,
  SearchCode,
  Share2,
  ShieldCheck,
  Activity,
} from "lucide-react";

const FEATURES = [
  {
    icon: Layers,
    title: "Canonical store + projections",
    body: "A single authoritative MemoryStore. Vector, search, graph, and cache stores are optional, rebuildable projections — never a source of truth.",
    href: "/docs/ARCHITECTURE",
  },
  {
    icon: GitBranch,
    title: "Evolution & versioning",
    body: "Identity stays stable while content evolves. Every change is preserved as an immutable version — nothing is ever overwritten.",
    href: "/docs/MEMORY-EVOLUTION",
  },
  {
    icon: SearchCode,
    title: "Hybrid search",
    body: "Structured filters, keyword relevance, semantic similarity, and relationship signals — combined and ranked in one search() call.",
    href: "/docs/SEARCH",
  },
  {
    icon: Share2,
    title: "Memory graph",
    body: "Typed, directed relationships between memories — supports, contradicts, supersedes, or your own — with multi-hop traversal.",
    href: "/docs/GRAPH",
  },
  {
    icon: ShieldCheck,
    title: "Security by default",
    body: "Tenant isolation, authorization hooks, redaction, and transparent AES-256-GCM encryption-at-rest via a MemoryStore decorator.",
    href: "/docs/SECURITY",
  },
  {
    icon: Activity,
    title: "Observability",
    body: "Provider-independent Logger, MetricsProvider, and Tracer hooks — plug in whatever you already run in production.",
    href: "/docs/OBSERVABILITY",
  },
];

export function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((f) => (
        <Link
          key={f.title}
          href={f.href}
          className="group flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-raised)] p-5 no-underline transition-colors hover:border-[var(--border-strong)]"
        >
          <f.icon size={18} className="text-[var(--accent)]" strokeWidth={1.75} />
          <h3 className="font-display text-[15px] font-semibold text-[var(--text)]">
            {f.title}
          </h3>
          <p className="text-[13.5px] leading-relaxed text-[var(--text-muted)]">{f.body}</p>
          <span className="mt-auto pt-1 text-[13px] text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100">
            Read more →
          </span>
        </Link>
      ))}
    </div>
  );
}
