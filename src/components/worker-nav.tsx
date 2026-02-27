"use client";

import Link from "next/link";

export function WorkerNav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl" style={{ borderBottomColor: "rgba(195,151,73,0.25)" }}>
      <div className="mx-auto flex h-14 max-w-2xl items-center px-6">
        <Link href="/worker" className="flex items-center gap-2 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md shrink-0" style={{ backgroundColor: "#1B3D21" }}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#C39749" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2 L13.53 8.3 L17.66 6.34 L15.7 10.47 L22 12 L15.7 13.53 L17.66 17.66 L13.53 15.7 L12 22 L10.47 15.7 L6.34 17.66 L8.3 13.53 L2 12 L8.3 10.47 L6.34 6.34 L10.47 8.3 Z" />
            </svg>
          </div>
        </Link>
      </div>
    </header>
  );
}
