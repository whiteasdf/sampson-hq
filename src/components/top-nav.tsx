"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  LogOut,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Accounts", icon: Users },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl"
      style={{ borderBottomColor: "rgba(195,151,73,0.25)" }}
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
            style={{ backgroundColor: "#1B3D21" }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="#C39749"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 2 L13.53 8.3 L17.66 6.34 L15.7 10.47 L22 12 L15.7 13.53 L17.66 17.66 L13.53 15.7 L12 22 L10.47 15.7 L6.34 17.66 L8.3 13.53 L2 12 L8.3 10.47 L6.34 6.34 L10.47 8.3 Z" />
            </svg>
          </div>
          <span
            className="text-[16px] tracking-tight"
            style={{ fontFamily: '"Big Caslon", "Book Antiqua", "Palatino Linotype", Georgia, serif', fontWeight: 600 }}
          >
            Sampson
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  DH
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-semibold">D. Humphrey</p>
              <p className="text-xs text-muted-foreground">Partner</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
