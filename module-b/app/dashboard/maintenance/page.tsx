"use client";

import { api, useAuth } from "@/lib/api";
import { useEffect, useState } from "react";

interface MaintenanceRequest {
  requestId: number;
  roomId?: number;
  reportedBy: number;
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High" | "Emergency";
  status: "Open" | "In_Progress" | "Resolved";
  reportedDate?: string;
  resolvedDate?: string;
  resolvedBy?: number;
}

const EMPTY_FORM = {
  roomId: "",
  title: "",
  description: "",
  priority: "Medium" as MaintenanceRequest["priority"],
};

function PriorityBadge({ priority }: { priority: MaintenanceRequest["priority"] }) {
  const cls =
    priority === "Emergency"
      ? "border-destructive text-destructive"
      : priority === "High"
      ? "border-primary text-primary"
      : "border-border text-muted-foreground";
  return <span className={`border px-1 text-[10px] ${cls}`}>{priority}</span>;
}

function StatusBadge({ status }: { status: MaintenanceRequest["status"] }) {
  const cls =
    status === "Open"
      ? "border-primary text-primary"
      : status === "Resolved"
      ? "border-border text-muted-foreground"
      : "border-border text-muted-foreground";
  return <span className={`border px-1 text-[10px] ${cls}`}>{status}</span>;
}

export default function MaintenancePage() {
  const { isAdmin } = useAuth();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchRequests = async () => {
    try {
      const data = await api.get("/api/maintenance");
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load maintenance requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    try {
      const result = await api.post("/api/maintenance", {
        roomId: form.roomId ? Number(form.roomId) : null,
        title: form.title,
        description: form.description,
        priority: form.priority,
      });
      if (result.error) setFormError(result.error);
      else {
        closeForm();
        fetchRequests();
      }
    } catch {
      setFormError("Request failed");
    } finally {
      setFormLoading(false);
    }
  };

  const handleStatusUpdate = async (id: number, status: MaintenanceRequest["status"]) => {
    try {
      const result = await api.put(`/api/maintenance/${id}`, { status });
      if (result.error) setError(result.error);
      else fetchRequests();
    } catch {
      setError("Update failed");
    }
  };

  const fmt = (v?: string) => (v ? new Date(v).toLocaleDateString() : "-");

  return (
    <div className="p-6">
      <div className="border-b border-border pb-5 mb-4 flex items-end justify-between">
        <div className="border-l-4 border-primary pl-4">
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase leading-none">maintenance</h1>
          <p className="text-muted-foreground text-[10px] mt-1.5 tracking-widest uppercase">{requests.length} records &nbsp;·&nbsp; room issue tracking</p>
        </div>
        <button
          id="maintenance-new-btn"
          onClick={openCreate}
          className="border border-primary text-primary text-xs px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          [+ new request]
        </button>
      </div>

      {error && (
        <p className="text-primary text-xs border border-primary px-3 py-2 mb-4">✗ {error}</p>
      )}

      {showForm && (
        <div className="border border-border border-l-2 border-l-primary mb-4 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-primary uppercase tracking-widest">// new maintenance request</span>
            <button onClick={closeForm} className="text-xs text-muted-foreground hover:text-foreground">
              [cancel]
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <div className="space-y-0.5">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">room id (optional)</label>
              <input
                type="number"
                value={form.roomId}
                onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
                className="w-full bg-transparent border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-0.5">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as MaintenanceRequest["priority"] }))}
                className="w-full bg-background border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Emergency">Emergency</option>
              </select>
            </div>
            <div className="col-span-2 space-y-0.5">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                className="w-full bg-transparent border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div className="col-span-2 space-y-0.5">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                required
                rows={3}
                className="w-full bg-transparent border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="col-span-2 flex items-center gap-3 pt-1">
              {formError && <span className="text-primary text-xs flex-1">✗ {formError}</span>}
              <button
                type="submit"
                disabled={formLoading}
                className="bg-primary text-primary-foreground text-xs px-4 py-1.5 font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
              >
                {formLoading ? "submitting..." : "SUBMIT"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                {["ID", "ROOM", "TITLE", "PRIORITY", "STATUS", "REPORTED", "REPORTED_BY"].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 font-normal uppercase tracking-widest">{h}</th>
                ))}
                {isAdmin && (
                  <th className="text-left py-2 font-normal uppercase tracking-widest">ACTIONS</th>
                )}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.requestId} className="border-b border-border hover:bg-muted/20">
                  <td className="py-2 pr-4 text-muted-foreground">{r.requestId}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.roomId ?? "-"}</td>
                  <td className="py-2 pr-4 text-foreground max-w-[120px] truncate">{r.title}</td>
                  <td className="py-2 pr-4">
                    <PriorityBadge priority={r.priority} />
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{fmt(r.reportedDate)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.reportedBy}</td>
                  {isAdmin && (
                    <td className="py-2 space-x-2">
                      {r.status === "Open" && (
                        <button
                          onClick={() => handleStatusUpdate(r.requestId, "In_Progress")}
                          className="text-muted-foreground hover:text-primary text-xs"
                        >
                          [in_progress]
                        </button>
                      )}
                      {r.status !== "Resolved" && (
                        <button
                          onClick={() => handleStatusUpdate(r.requestId, "Resolved")}
                          className="text-muted-foreground hover:text-foreground text-xs"
                        >
                          [resolve]
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 8 : 7}
                    className="py-6 text-center text-muted-foreground"
                  >
                    no records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
