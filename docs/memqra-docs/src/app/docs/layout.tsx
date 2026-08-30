import { TopNav } from "@/components/top-nav";
import { Sidebar } from "@/components/sidebar";
import { MobileNavProvider, MobileNavDrawer } from "@/components/mobile-nav";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <TopNav />
      <MobileNavDrawer>
        <Sidebar />
      </MobileNavDrawer>
      <div className="mx-auto flex max-w-[1400px] gap-10 px-4 sm:px-6">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 lg:block">
          <Sidebar />
        </aside>
        <main className="min-w-0 flex-1 py-8">{children}</main>
      </div>
    </MobileNavProvider>
  );
}
