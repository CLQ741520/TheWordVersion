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
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <NavLink to="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              W
            </span>
            <span className="hidden sm:inline">TheWord</span>
          </NavLink>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
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
