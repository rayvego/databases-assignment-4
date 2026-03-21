import Link from "next/link";

const FEATURES = [
  ["auth", "JWT HS256 · 7-day expiry · bcrypt password hashing"],
  ["rbac", "admin:full_crud / user:read+request - enforced per route"],
  ["audit", "every INSERT/UPDATE/DELETE → audit_log table + audit.log file"],
  ["index", "9 SQL B+ Tree indexes · 5–15× speedup on FK lookups"],
  ["stack", "Next.js 16 · Drizzle ORM · SQLite · TypeScript"],
];

const MODULES = [
  "members", "students", "rooms", "allocations",
  "gate_passes", "maintenance", "fee_payments", "audit_log",
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground font-mono flex flex-col">

      {/* Top bar */}
      <div className="border-b border-border px-6 md:px-12 py-2 flex items-center justify-between text-[10px] text-muted-foreground tracking-widest uppercase shrink-0">
        <span className="text-primary font-bold">CHECKINOUT</span>
        <span className="hidden sm:block">cs432 · databases · assignment 2 · track 1 · iit gandhinagar</span>
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col justify-center px-6 md:px-12 py-12 md:py-20">

        {/* Giant title block with orange left anchor */}
        <div className="border-l-4 border-primary pl-6 md:pl-10 mb-10">
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.3em] mb-3">
            sys:hostel-management-v2.0
          </div>
          <h1
            className="font-black text-primary leading-[0.9] tracking-tighter uppercase"
            style={{ fontSize: "clamp(3.5rem, 13vw, 10rem)" }}
          >
            CHECK
            <br />
            INOUT
          </h1>
          <div className="mt-4 text-muted-foreground text-sm max-w-xl leading-relaxed">
            A secure, audited hostel management system with role-based access
            control and indexed SQLite storage. Built on Next.js App Router.
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-8 text-[10px] text-muted-foreground tracking-widest uppercase">
          <span className="text-primary">▸</span>
          <span>capabilities</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* Feature table */}
        <div className="mb-10 max-w-2xl">
          {FEATURES.map(([key, val], i) => (
            <div
              key={key}
              className={`flex gap-0 text-xs ${i < FEATURES.length - 1 ? "border-b border-border" : ""}`}
            >
              <span className="text-primary font-bold w-16 shrink-0 py-2.5 uppercase tracking-widest text-[10px]">
                {key}
              </span>
              <span className="border-l border-border pl-4 py-2.5 text-muted-foreground">
                {val}
              </span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6 text-[10px] text-muted-foreground tracking-widest uppercase">
          <span className="text-primary">▸</span>
          <span>modules</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* Modules inline */}
        <div className="flex flex-wrap gap-x-0 gap-y-0 mb-12 border border-border w-fit">
          {MODULES.map((mod, i) => (
            <span
              key={mod}
              className={`px-4 py-2 text-[11px] text-muted-foreground tracking-wider uppercase ${
                i < MODULES.length - 1 ? "border-r border-border" : ""
              }`}
            >
              {mod}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-4 flex-wrap">
          <Link
            href="/login"
            className="bg-primary text-primary-foreground px-10 py-4 text-sm font-black tracking-[0.2em] uppercase hover:opacity-90 transition-opacity"
          >
            LOGIN →
          </Link>
          <Link
            href="/dashboard"
            className="border border-border text-muted-foreground px-10 py-4 text-sm tracking-[0.2em] uppercase hover:border-primary hover:text-primary transition-colors"
          >
            DASHBOARD
          </Link>
          <span className="text-[10px] text-muted-foreground tracking-widest ml-2 hidden md:block">
            admin / admin123 &nbsp;·&nbsp; testuser / user123
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-6 md:px-12 py-3 flex items-center justify-between text-[10px] text-muted-foreground tracking-wider shrink-0">
        <span>Mohit Kamlesh Panchal · 23110208 · B.Tech CSE 2027</span>
        <span className="hidden sm:flex items-center gap-1.5">
          <span className="text-primary">●</span>
          <span>sys:operational</span>
        </span>
      </div>
    </main>
  );
}
