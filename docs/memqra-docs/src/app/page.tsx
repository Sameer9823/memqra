import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { GithubIcon } from "@/components/github-icon";
import { TopNav } from "@/components/top-nav";
import { MobileNavProvider, MobileNavDrawer } from "@/components/mobile-nav";
import { Sidebar } from "@/components/sidebar";
import { VersionTimeline } from "@/components/version-timeline";
import { InstallCommand } from "@/components/install-command";
import { FeatureGrid } from "@/components/feature-grid";
import { HomeCodePanel } from "@/components/home-code-panel";
import { ArchitectureDiagram } from "@/components/architecture-diagram";

const CORE_IDEAS = [
  {
    term: "Identity vs. state vs. version",
    body: "A stable id persists across an evolving content and state, while every change is preserved as an immutable MemoryVersion — nothing is ever overwritten.",
  },
  {
    term: "Explicit lifecycle",
    body: "Memories move through active → updated → archived / expired / superseded / merged → deleted. Invalid transitions throw InvalidStateTransitionError rather than silently succeeding.",
  },
  {
    term: "Namespaces & subjects, not users & chats",
    body: "Nothing in the core model assumes a chatbot. subjectId can be a user, a project, a device, a document — whatever your application needs it to mean.",
  },
  {
    term: "Graceful degradation",
    body: "With zero optional adapters configured, search() still works — structured filters plus a keyword score. Add a SearchStore or VectorStore later and relevance improves without changing the call site.",
  },
];

const ADAPTERS = [
  { name: "InMemory", note: "tests & prototyping" },
  { name: "SQLite", note: "local-first, single-node" },
  { name: "PostgreSQL", note: "real transactions" },
  { name: "Redis", note: "cache-aside" },
  { name: "SQLite FTS5", note: "bm25 keyword search" },
  { name: "In-memory vector", note: "cosine similarity" },
];

const NOT_LIST = [
  "a chatbot",
  "an AI assistant",
  "a vector-database wrapper",
  "tied to one AI vendor",
  "a hosted-only service",
];

export default function Home() {
  return (
    <MobileNavProvider>
      <TopNav />
      <MobileNavDrawer>
        <Sidebar />
      </MobileNavDrawer>

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div
              className="absolute right-[-6%] top-12 h-[440px] w-[440px] rounded-full blur-[170px]"
              style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}
            />
          </div>

          <div className="relative grid grid-cols-1 gap-16 pb-20 pt-16 sm:pb-28 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-12">
            <div>
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
                Universal memory infrastructure
              </span>
              <h1 className="font-display max-w-2xl text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-[var(--text)] sm:text-[3.5rem]">
                Memory that <span className="text-[var(--accent)]">evolves</span>, versions, and
                stays <span className="text-[var(--amber)]">traceable</span>.
              </h1>
              <p className="mt-6 max-w-lg text-[15.5px] leading-relaxed text-[var(--text-muted)]">
                Memorie is a reusable memory infrastructure layer for AI systems and
                software — not a chatbot, not a vector-database wrapper. A canonical
                store stays authoritative while search, vector, graph, and cache
                stay optional, rebuildable projections of it.
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                <InstallCommand />
                <div className="flex items-center gap-3">
                  <Link
                    href="/docs/introduction"
                    className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-[13.5px] font-medium text-[#0b0d12] no-underline shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_50%,transparent)] transition-all hover:opacity-90 hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_50%,transparent),0_0_24px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
                  >
                    Get started <ArrowRight size={14} />
                  </Link>
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                    aria-label="View on GitHub"
                  >
                    <GithubIcon size={16} />
                  </a>
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-1 lg:justify-end lg:pt-9">
              <VersionTimeline />
            </div>
          </div>
        </section>

        {/* Code showcase */}
        <section className="border-t border-[var(--border)] py-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
                Five lines to a memory that remembers its own history
              </p>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text)]">
                One engine. Every backend.
              </h2>
              <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-[var(--text-muted)]">
                Start in memory for tests, move to SQLite for local-first apps,
                or run PostgreSQL + Redis in production — the same{" "}
                <code className="rounded border border-[var(--border)] bg-[var(--bg-inset)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--amber)]">
                  MemoryEngine
                </code>{" "}
                API works unchanged.
              </p>
              <Link
                href="/docs/quickstart"
                className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[var(--accent)] no-underline"
              >
                Read the quickstart <ArrowRight size={13} />
              </Link>
            </div>
            <HomeCodePanel />
          </div>
        </section>

        {/* Why Memorie — canonical store + projections */}
        <section className="border-t border-[var(--border)] py-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
                Why Memorie exists
              </p>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text)]">
                The vector store isn&apos;t the source of truth. It never was.
              </h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--text-muted)]">
                Most &ldquo;AI memory&rdquo; libraries collapse everything into one
                pipeline — text, then an embedding, then a vector database, then
                similarity search — and quietly make that vector database the
                source of truth. It works for recall. It can&apos;t answer
                &ldquo;what did we believe last week?&rdquo;, &ldquo;where did
                this claim come from?&rdquo;, or let you switch vector providers
                without losing history.
              </p>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--text-muted)]">
                Memorie inverts it. A canonical{" "}
                <code className="rounded border border-[var(--border)] bg-[var(--bg-inset)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--amber)]">
                  MemoryStore
                </code>{" "}
                is always authoritative. Everything else — vector, search,
                graph, cache — is a projection: derived, optional, and rebuildable
                from canonical data at any time.
              </p>
              <Link
                href="/docs/ARCHITECTURE"
                className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[var(--accent)] no-underline"
              >
                Read the architecture <ArrowRight size={13} />
              </Link>
            </div>
            <ArchitectureDiagram />
          </div>
        </section>

        {/* Core ideas */}
        <section className="border-t border-[var(--border)] py-16">
          <div className="mb-8 max-w-xl">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
              The model
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text)]">
              Four ideas the rest is built on
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
            {CORE_IDEAS.map((idea) => (
              <div key={idea.term} className="border-l-2 border-[var(--border-strong)] pl-4">
                <h3 className="font-mono text-[13px] font-medium text-[var(--text)]">
                  {idea.term}
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                  {idea.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-[var(--border)] py-16">
          <div className="mb-8 max-w-xl">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
              What&apos;s built
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text)]">
              Infrastructure, not a framework
            </h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--text-muted)]">
              Every piece below composes independently. Configure only what
              your application needs — the engine degrades gracefully without
              any of it.
            </p>
          </div>
          <FeatureGrid />
        </section>

        {/* Adapters */}
        <section className="border-t border-[var(--border)] py-16">
          <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
                No fake implementations
              </p>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text)]">
                Every adapter runs against a real backend
              </h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--text-muted)]">
                Each adapter is verified against the shared contract-test suite
                and a live instance of what it wraps — a real local PostgreSQL,
                a real local Redis — not an in-memory mock standing in for one.
              </p>
            </div>
            <Link
              href="/docs/ADAPTERS"
              className="inline-flex shrink-0 items-center gap-1.5 text-[13.5px] font-medium text-[var(--accent)] no-underline"
            >
              See all adapters <ArrowRight size={13} />
            </Link>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {ADAPTERS.map((a) => (
              <div
                key={a.name}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-3.5 py-2"
              >
                <Check size={13} className="shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
                <span className="font-mono text-[12.5px] text-[var(--text)]">{a.name}</span>
                <span className="text-[11.5px] text-[var(--text-faint)]">— {a.note}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Positioning band */}
        <section className="border-t border-[var(--border)] py-14">
          <div className="flex flex-col items-start gap-5 rounded-xl border border-[var(--border)] bg-[var(--bg-raised)] px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p className="font-display text-lg font-semibold tracking-tight text-[var(--text)] sm:max-w-xs">
              Memorie is memory infrastructure.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {NOT_LIST.map((item) => (
                <span
                  key={item}
                  className="whitespace-nowrap font-mono text-[12.5px] text-[var(--text-faint)] line-through decoration-[var(--border-strong)]"
                >
                  not {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-start justify-between gap-4 border-t border-[var(--border)] py-10 text-[13px] text-[var(--text-faint)] sm:flex-row sm:items-center">
          <span>Memorie — MIT licensed.</span>
          <div className="flex items-center gap-5">
            <Link href="/docs/introduction" className="hover:text-[var(--text)]">
              Docs
            </Link>
            <Link href="/docs/ARCHITECTURE" className="hover:text-[var(--text)]">
              Architecture
            </Link>
            <Link href="/docs/API" className="hover:text-[var(--text)]">
              API reference
            </Link>
            <Link href="/docs/CONTRIBUTING" className="hover:text-[var(--text)]">
              Contributing
            </Link>
            <a href="https://github.com/Sameer9823/memorie" target="_blank" rel="noreferrer" className="hover:text-[var(--text)]">
              GitHub
            </a>
          </div>
        </footer>
      </main>
    </MobileNavProvider>
  );
}