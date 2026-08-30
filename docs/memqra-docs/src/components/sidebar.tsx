"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { nav } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6 text-sm">
      {nav.map((group) => (
        <div key={group.label}>
          <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-faint)]">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const href = `/docs/${item.slug}`;
              const active = pathname === href;
              return (
                <li key={item.slug}>
                  <Link
                    href={href}
                    className={`block rounded-md px-2.5 py-1.5 transition-colors ${
                      active
                        ? "bg-[var(--bg-raised)] font-medium text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--bg-raised)] hover:text-[var(--text)]"
                    }`}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
