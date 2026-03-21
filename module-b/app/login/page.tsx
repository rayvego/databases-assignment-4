"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("token")) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", data.username);
      router.replace("/dashboard");
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background font-mono flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border px-6 py-2 flex items-center justify-between text-[10px] text-muted-foreground tracking-widest uppercase shrink-0">
        <span className="text-primary font-bold">CHECKINOUT</span>
        <span className="hidden sm:block">auth:login</span>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Brand */}
          <div className="border-l-4 border-primary pl-6 mb-10">
            <div className="text-[10px] text-muted-foreground uppercase tracking-[0.3em] mb-2">
              sys:authentication
            </div>
            <h1
              className="font-black text-primary leading-[0.9] tracking-tighter uppercase"
              style={{ fontSize: "clamp(3rem, 10vw, 5.5rem)" }}
            >
              CHECK
              <br />
              INOUT
            </h1>
          </div>

          {/* Form */}
          <div className="border border-border">
            <div className="border-b border-border px-4 py-2 text-[10px] text-muted-foreground uppercase tracking-widest">
              $ auth --login
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="username"
                  className="block text-[10px] text-muted-foreground uppercase tracking-[0.2em]"
                >
                  username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full bg-transparent border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="admin"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="password"
                  className="block text-[10px] text-muted-foreground uppercase tracking-[0.2em]"
                >
                  password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-transparent border border-border px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-primary text-xs border border-primary px-3 py-2">
                  ✗ {error}
                </p>
              )}

              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground py-3 text-sm font-black tracking-[0.2em] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "authenticating..." : "LOGIN →"}
              </button>
            </form>
          </div>

          {/* Hint */}
          <div className="mt-4 text-[10px] text-muted-foreground tracking-wider space-y-0.5 pl-1">
            <div>admin / admin123 &nbsp;·&nbsp; full access</div>
            <div>testuser / user123 &nbsp;·&nbsp; read + request</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-6 py-3 flex items-center justify-between text-[10px] text-muted-foreground tracking-wider shrink-0">
        <span>Mohit Kamlesh Panchal · 23110208 · B.Tech CSE 2027</span>
        <span className="hidden sm:flex items-center gap-1.5">
          <span className="text-primary">●</span>
          <span>sys:operational</span>
        </span>
      </div>
    </main>
  );
}
