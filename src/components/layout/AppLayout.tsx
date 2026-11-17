import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { BarChart3, BookOpen, History, ListChecks, ScanLine, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "单词识别", icon: ScanLine, end: true },
  { to: "/history", label: "识别历史", icon: History, end: false },
  { to: "/wordbook", label: "生词本", icon: BookOpen, end: false },
  { to: "/review", label: "复习", icon: Sparkles, end: false },
  { to: "/quiz", label: "测验", icon: ListChecks, end: false },
  { to: "/stats", label: "统计", icon: BarChart3, end: false },
];

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 pb-3 pt-[27px]">
          <NavLink
            to="/"
            className="flex shrink-0 items-center justify-center gap-2 text-[32px] font-semibold tracking-tight"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-[32px] text-primary-foreground">
              A
            </span>
            <span className="hidden sm:inline">AsyWL</span>
            <span className="hidden text-[21px] font-normal text-muted-foreground md:inline">
              AsyWordLearning
            </span>
            <span className="hidden text-[21px] font-normal text-muted-foreground sm:inline">
              · 忆廿
            </span>
          </NavLink>
          <nav className="flex flex-wrap items-center justify-center gap-2">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex h-[77px] shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-[32px] font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )
                }
              >
                <Icon className="h-8 w-8" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
