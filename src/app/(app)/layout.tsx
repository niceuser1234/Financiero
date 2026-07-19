import { Sidebar, BottomTabs } from "@/components/app-nav";
import { Toaster } from "@/components/ui/sonner";

// DB-gestützte Seiten immer frisch rendern (kein Prerender mit Build-Zeit-Daten).
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex-1 pb-16 md:pb-0">
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8">{children}</main>
      </div>
      <BottomTabs />
      <Toaster position="top-center" richColors />
    </div>
  );
}
