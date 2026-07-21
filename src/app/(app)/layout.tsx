import { Sidebar, BottomTabs } from "@/components/app-nav";
import { Toaster } from "@/components/ui/sonner";

// DB-gestützte Seiten immer frisch rendern (kein Prerender mit Build-Zeit-Daten).
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <main className="max-w-[1440px] px-4 py-8 md:px-[var(--page-pad-x)] md:py-[var(--page-pad-y)]">
          {children}
        </main>
      </div>
      <BottomTabs />
      <Toaster position="top-center" richColors />
    </div>
  );
}
