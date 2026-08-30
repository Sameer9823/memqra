"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function InstallCommand() {
  const [copied, setCopied] = useState(false);
  const cmd = "npm install @memorie/core @memorie/storage-memory";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      onClick={copy}
      className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-4 py-3 text-left font-mono text-[13px] transition-colors hover:border-[var(--border-strong)] sm:w-auto"
    >
      <span className="text-[var(--text-faint)]">$</span>
      <span className="flex-1 text-[var(--text)]">{cmd}</span>
      {copied ? (
        <Check size={14} className="shrink-0 text-[var(--accent)]" />
      ) : (
        <Copy size={14} className="shrink-0 text-[var(--text-faint)]" />
      )}
    </button>
  );
}
