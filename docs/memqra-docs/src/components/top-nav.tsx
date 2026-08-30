import Link from "next/link";
import { Menu } from "lucide-react";
import { GithubIcon } from "@/components/github-icon";
import { SearchDialog } from "./search-dialog";
import { ThemeToggle } from "./theme-toggle";
import { MobileNavToggle } from "./mobile-nav";

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3 lg:hidden">
          <MobileNavToggle>
            <Menu size={18} />
          </MobileNavToggle>
        </div>

        <Link href="/" className="flex items-center gap-2 shrink-0">
          <LogoMark />
          <span className="font-display text-[15px] font-semibold tracking-tight text-[var(--text)]">
            memorie
          </span>
        </Link>

        <nav className="hidden items-center gap-5 pl-2 text-[13.5px] text-[var(--text-muted)] md:flex">
          <Link href="/docs/introduction" className="transition-colors hover:text-[var(--text)]">
            Docs
          </Link>
          <Link href="/docs/API" className="transition-colors hover:text-[var(--text)]">
            API reference
          </Link>
          <Link href="/docs/EXAMPLES" className="transition-colors hover:text-[var(--text)]">
            Examples
          </Link>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <SearchDialog />
          <a
            href="https://github.com/Sameer9823/memorie"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="hidden h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-raised)] hover:text-[var(--text)] sm:flex"
          >
            <GithubIcon size={16} />
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="var(--accent)" fillOpacity="0.14" />
      <path
        d="M7 16.5V8.2c0-.4.32-.7.7-.7.24 0 .46.12.59.33L12 13.4l3.71-5.57c.13-.21.35-.33.59-.33.38 0 .7.3.7.7v8.3"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="17.6" r="1.15" fill="var(--amber)" />
    </svg>
  );
}
