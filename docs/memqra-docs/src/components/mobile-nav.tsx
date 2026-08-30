"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

const MobileNavContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>
  );
}

export function MobileNavToggle({ children }: { children: React.ReactNode }) {
  const { setOpen } = useContext(MobileNavContext);
  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Open navigation"
      className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-raised)] hover:text-[var(--text)]"
    >
      {children}
    </button>
  );
}

export function MobileNavDrawer({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useContext(MobileNavContext);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="absolute left-0 top-0 h-full w-72 overflow-y-auto border-r border-[var(--border)] bg-[var(--bg)] p-4">
        <button
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
          className="mb-4 flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-raised)]"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}
