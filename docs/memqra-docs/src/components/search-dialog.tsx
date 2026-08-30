"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import { Search, FileText, CornerDownLeft } from "lucide-react";

type Entry = {
  slug: string;
  title: string;
  description: string;
  headings: string[];
  excerpt: string;
};

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/search-index.json")
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const fuse = useMemo(
    () =>
      new Fuse(entries, {
        keys: [
          { name: "title", weight: 0.5 },
          { name: "headings", weight: 0.3 },
          { name: "description", weight: 0.1 },
          { name: "excerpt", weight: 0.1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [entries],
  );

  const results = useMemo(() => {
    if (!query.trim()) return entries.slice(0, 8);
    return fuse.search(query, { limit: 8 }).map((r) => r.item);
  }, [query, fuse, entries]);

  useEffect(() => setActiveIndex(0), [query]);

  const go = (slug: string) => {
    setOpen(false);
    router.push(`/docs/${slug}`);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-64 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-3 text-sm text-[var(--text-faint)] transition-colors hover:border-[var(--border-strong)] sm:w-64"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search docs…</span>
        <kbd className="rounded border border-[var(--border-strong)] bg-[var(--bg-inset)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-faint)]">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-raised)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <Search size={16} className="text-[var(--text-faint)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && results[activeIndex]) {
                    go(results[activeIndex].slug);
                  }
                }}
                placeholder="Search Memorie docs…"
                className="w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
              />
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-[var(--text-faint)]">
                  No results for &ldquo;{query}&rdquo;
                </p>
              )}
              {results.map((r, i) => (
                <button
                  key={r.slug}
                  onClick={() => go(r.slug)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    i === activeIndex ? "bg-[var(--bg-inset)]" : ""
                  }`}
                >
                  <FileText size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[var(--text)]">{r.title}</span>
                    <span className="block truncate text-xs text-[var(--text-faint)]">
                      {r.description}
                    </span>
                  </span>
                  {i === activeIndex && (
                    <CornerDownLeft size={13} className="mt-1 shrink-0 text-[var(--text-faint)]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
