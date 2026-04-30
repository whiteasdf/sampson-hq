"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function WorkerNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl" style={{ borderBottomColor: "rgba(195,151,73,0.25)" }}>
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-6 px-6">
        <Link href="/worker" className="flex items-center gap-2 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md shrink-0" style={{ backgroundColor: "#1B3D21" }}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#C39749" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2 L13.53 8.3 L17.66 6.34 L15.7 10.47 L22 12 L15.7 13.53 L17.66 17.66 L13.53 15.7 L12 22 L10.47 15.7 L6.34 17.66 L8.3 13.53 L2 12 L8.3 10.47 L6.34 6.34 L10.47 8.3 Z" />
            </svg>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/worker"
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              pathname === "/worker"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            Dashboard
          </Link>
          <Link
            href="/worker/time-log"
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              pathname === "/worker/time-log"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            Time Log
          </Link>
        </nav>
      </div>
    </header>
  );
}
