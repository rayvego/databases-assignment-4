"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/api";

const NAV_LINKS = [
  { href: "/dashboard", label: "overview" },
  { href: "/dashboard/members", label: "members" },
  { href: "/dashboard/students", label: "students" },
  { href: "/dashboard/rooms", label: "rooms" },
  { href: "/dashboard/gatepasses", label: "gate_passes" },
  { href: "/dashboard/maintenance", label: "maintenance" },
  { href: "/dashboard/allocations", label: "allocations" },
  { href: "/dashboard/fees", label: "fee_payments" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, username, role, logout } = useAuth();

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [token, router]);

  if (!token) return null;

  return (
    <div className="min-h-screen bg-background flex font-mono">
      {/* Sidebar */}
      <aside className="w-48 border-r border-border flex flex-col fixed top-0 left-0 h-full shrink-0">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-border">
          <Link href="/" className="block hover:opacity-80 transition-opacity">
            <div className="text-primary font-black text-2xl tracking-tighter leading-none uppercase">
              CHECK
              <br />
              INOUT
            </div>
            <div className="text-muted-foreground text-[10px] mt-2 tracking-widest uppercase">v2.0 // hms</div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block py-2 text-xs transition-colors tracking-wider ${
                  isActive
                    ? "text-primary border-l-4 border-primary pl-3 bg-primary/5 font-bold uppercase"
                    : "text-muted-foreground pl-4 hover:text-foreground hover:border-l-4 hover:border-border"
                }`}
              >
                {isActive && <span className="mr-1">▸</span>}{link.label}
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="border-t border-border px-4 py-3 space-y-1">
          <div className="text-xs text-foreground truncate">{username}</div>
          <div className="text-xs">
            <span className="border border-primary text-primary px-1 py-0.5 text-[10px]">
              {role}
            </span>
          </div>
          <button
            id="sidebar-logout"
            onClick={logout}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors mt-1"
          >
            [logout]
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-48 flex-1 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  );
}
