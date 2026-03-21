"use client";

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

interface StatBlock {
  label: string;
  value: number | string;
  loading: boolean;
}

export default function DashboardOverview() {
  const [stats, setStats] = useState({
    members: 0,
    students: 0,
    activeAllocations: 0,
    pendingPasses: 0,
    openMaintenance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [members, students, allocations, gatepasses, maintenance] =
          await Promise.all([
            api.get("/api/members"),
            api.get("/api/students"),
            api.get("/api/allocations"),
            api.get("/api/gatepasses"),
            api.get("/api/maintenance"),
          ]);

        setStats({
          members: Array.isArray(members) ? members.length : 0,
          students: Array.isArray(students) ? students.length : 0,
          activeAllocations: Array.isArray(allocations)
            ? allocations.filter((a: { status: string }) => a.status === "Active").length
            : 0,
          pendingPasses: Array.isArray(gatepasses)
            ? gatepasses.filter((g: { status: string }) => g.status === "Pending").length
            : 0,
          openMaintenance: Array.isArray(maintenance)
            ? maintenance.filter((m: { status: string }) => m.status === "Open").length
            : 0,
        });
      } catch {
        setError("Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statBlocks: StatBlock[] = [
    { label: "Total Members", value: stats.members, loading },
    { label: "Total Students", value: stats.students, loading },
    { label: "Active Allocations", value: stats.activeAllocations, loading },
    { label: "Pending Gate Passes", value: stats.pendingPasses, loading },
    { label: "Open Maintenance", value: stats.openMaintenance, loading },
  ];

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="border-b border-border pb-5 mb-6">
        <div className="border-l-4 border-primary pl-4">
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase leading-none">
            overview
          </h1>
          <p className="text-muted-foreground text-[10px] mt-1.5 tracking-widest uppercase">
            // system status at a glance
          </p>
        </div>
      </div>

      {error && (
        <p className="text-primary text-sm mb-4 border border-primary px-3 py-2">
          ✗ {error}
        </p>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 border border-border">
        {statBlocks.map((block, i) => (
          <div
            key={block.label}
            className={`border-border p-6 relative ${
              i % 3 !== 2 ? "border-r" : ""
            } ${i < 3 ? "border-b" : ""}`}
          >
            <div className="text-muted-foreground text-[10px] uppercase tracking-[0.25em] mb-3">
              {block.label}
            </div>
            <div className="font-black text-primary leading-none tracking-tighter" style={{ fontSize: "clamp(3rem, 6vw, 5rem)" }}>
              {block.loading ? (
                <span className="text-muted-foreground text-2xl font-normal">-</span>
              ) : (
                block.value
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="mt-8 text-muted-foreground text-xs border-t border-border pt-4">
        // use the sidebar to navigate to individual sections
      </div>
    </div>
  );
}
