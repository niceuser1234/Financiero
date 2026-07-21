"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Repeat,
  ChartPie,
  Settings,
  Wallet,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transaktionen", icon: ArrowLeftRight },
  { href: "/contracts", label: "Verträge", icon: Repeat },
  { href: "/analysis", label: "Analyse", icon: ChartPie },
  { href: "/assistant", label: "Assistent", icon: Sparkles },
  { href: "/settings", label: "Einstellungen", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-[var(--sidebar-w)] shrink-0 flex-col bg-background px-4 pt-[26px] pb-5 md:flex">
      <div className="flex items-center gap-2.5 px-3 pb-[26px]">
        <span className="grid size-[30px] place-items-center rounded-[9px] bg-primary text-primary-foreground">
          <Wallet className="size-[17px]" strokeWidth={2} />
        </span>
        <span className="font-display text-[19px] font-bold tracking-[-0.015em] text-ink-900">
          Financiero
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-[11px] text-[14.5px] transition-colors",
                active
                  ? "bg-primary font-semibold text-primary-foreground shadow-ds-accent"
                  : "font-medium text-ink-500 hover:bg-surface-hover hover:text-ink-900",
              )}
            >
              <Icon className="size-[19px]" strokeWidth={active ? 2 : 1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline bg-surface pt-2 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-1 text-[10.5px]",
              active ? "font-semibold text-[var(--accent)]" : "font-medium text-ink-400",
            )}
          >
            <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
