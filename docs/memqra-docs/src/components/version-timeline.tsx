"use client";

import { useEffect, useState } from "react";
import { GitCommitHorizontal, History } from "lucide-react";

const STEPS = [
  {
    version: 1,
    label: "add()",
    content: "Prefers TypeScript.",
    time: "Mar 2, 09:14",
  },
  {
    version: 2,
    label: "evolve()",
    content: "Prefers TypeScript for application development.",
    time: "Apr 18, 16:40",
  },
  {
    version: 3,
    label: "evolve()",
    content: "Prefers TypeScript; strict mode required on new services.",
    time: "Jun 30, 11:02",
  },
];

export function VersionTimeline() {
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setCursor(STEPS.length - 1);
      return;
    }
    const id = setInterval(() => {
      setCursor((c) => (c + 1) % (STEPS.length + 1));
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const activeStep = Math.min(cursor, STEPS.length - 1);
  const showingHistory = cursor >= STEPS.length;

  return (
    <div className="relative w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-raised)] p-5 font-mono text-[13px] shadow-[0_0_0_1px_rgba(0,0,0,0)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
          <GitCommitHorizontal size={12} />
          memory · user_123 · preference
        </span>
        <span
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
            showingHistory
              ? "bg-[color-mix(in_srgb,var(--amber)_18%,transparent)] text-[var(--amber)]"
              : "text-[var(--text-faint)]"
          }`}
        >
          <History size={10} />
          getAt()
        </span>
      </div>

      <div className="relative flex flex-col gap-0">
        {STEPS.map((step, i) => {
          const isPast = i < activeStep || (i === activeStep && !showingHistory) || showingHistory;
          const isCurrent = i === activeStep && !showingHistory;
          const isFaded = !showingHistory && i > activeStep;

          return (
            <div key={step.version} className="relative flex gap-3 pb-5 last:pb-0">
              {i < STEPS.length - 1 && (
                <span
                  className="absolute left-[7px] top-4 h-full w-px transition-colors duration-500"
                  style={{
                    background: isPast ? "var(--accent-dim)" : "var(--border)",
                  }}
                />
              )}
              <span
                className="relative z-10 mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500"
                style={{
                  borderColor: isPast ? "var(--accent)" : "var(--border-strong)",
                  background: isCurrent ? "var(--accent)" : "var(--bg-raised)",
                  opacity: isFaded ? 0.35 : 1,
                }}
              />
              <div
                className="min-w-0 flex-1 transition-opacity duration-500"
                style={{ opacity: isFaded ? 0.35 : 1 }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[var(--accent)]">v{step.version}</span>
                  <span className="text-[11px] text-[var(--text-faint)]">{step.label}</span>
                  <span className="ml-auto text-[10px] text-[var(--text-faint)]">{step.time}</span>
                </div>
                <p className="mt-0.5 truncate text-[var(--text-muted)]" title={step.content}>
                  &ldquo;{step.content}&rdquo;
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mt-3 flex items-center gap-2 border-t border-[var(--border)] pt-3 text-[11px] transition-opacity duration-300"
        style={{ opacity: showingHistory ? 1 : 0 }}
      >
        <History size={11} className="text-[var(--amber)]" />
        <span className="text-[var(--text-muted)]">
          Every prior state stays queryable — nothing is overwritten.
        </span>
      </div>
    </div>
  );
}
