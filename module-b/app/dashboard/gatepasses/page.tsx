"use client";

import { api, useAuth } from "@/lib/api";
import { useEffect, useState } from "react";

interface GatePass {
  passId: number;
  studentId: number;
  outTime: string;
  expectedInTime: string;
  actualInTime?: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected" | "Closed";
  approverId?: number;
}

const EMPTY_FORM = {
  studentId: "",
  outTime: "",
  expectedInTime: "",
  reason: "",
};

function StatusBadge({ status }: { status: GatePass["status"] }) {
  const cls =
    status === "Pending"
      ? "border-primary text-primary"
      : status === "Approved"
      ? "border-border text-muted-foreground"
      : status === "Rejected"
      ? "border-destructive text-destructive"
      : "border-border text-muted-foreground";
  return <span className={`border px-1 text-[10px] ${cls}`}>{status}</span>;
}

export default function GatepassesPage() {
  const { isAdmin } = useAuth();
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchPasses = async () => {
    try {
      const data = await api.get("/api/gatepasses");
      setPasses(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load gate passes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPasses();
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
      const result = await api.post("/api/gatepasses", {
        studentId: Number(form.studentId),
        outTime: form.outTime,
        expectedInTime: form.expectedInTime,
        reason: form.reason,
      });
      if (result.error) setFormError(result.error);
      else {
        closeForm();
        fetchPasses();
      }
    } catch {
      setFormError("Request failed");
    } finally {
      setFormLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      const result = await api.put(`/api/gatepasses/${id}`, { status: "Approved" });
      if (result.error) setError(result.error);
      else fetchPasses();
    } catch {
      setError("Action failed");
    }
  };

  const handleReject = async (id: number) => {
    try {
      const result = await api.put(`/api/gatepasses/${id}`, { status: "Rejected" });
      if (result.error) setError(result.error);
      else fetchPasses();
    } catch {
      setError("Action failed");
    }
  };

  const fmt = (v?: string) => (v ? new Date(v).toLocaleString() : "-");

  return (
    <div className="p-6">
      <div className="border-b border-border pb-5 mb-4 flex items-end justify-between">
        <div className="border-l-4 border-primary pl-4">
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase leading-none">gate_passes</h1>
          <p className="text-muted-foreground text-[10px] mt-1.5 tracking-widest uppercase">{passes.length} records &nbsp;·&nbsp; exit requests + approval</p>
        </div>
        <button
          id="gatepasses-new-btn"
          onClick={openCreate}
          className="border border-primary text-primary text-xs px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          [+ request pass]
        </button>
      </div>

      {error && (
        <p className="text-primary text-xs border border-primary px-3 py-2 mb-4">✗ {error}</p>
      )}

      {showForm && (
        <div className="border border-border border-l-2 border-l-primary mb-4 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-primary uppercase tracking-widest">// request gate pass</span>
            <button onClick={closeForm} className="text-xs text-muted-foreground hover:text-foreground">
              [cancel]
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            {[
              { label: "student id", key: "studentId", type: "number", required: true },
              { label: "out time", key: "outTime", type: "datetime-local", required: true },
              { label: "expected in time", key: "expectedInTime", type: "datetime-local", required: true },
            ].map(({ label, key, type, required }) => (
              <div key={key} className="space-y-0.5">
                <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">{label}</label>
                <input
                  type={type}
                  value={String(form[key as keyof typeof form])}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required={required}
                  className="w-full bg-transparent border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            ))}
            <div className="col-span-2 space-y-0.5">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">reason</label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                required
                className="w-full bg-transparent border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
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
                {["PASS_ID", "STUDENT_ID", "OUT_TIME", "EXP_IN_TIME", "REASON", "STATUS", "APPROVER"].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 font-normal uppercase tracking-widest">{h}</th>
                ))}
                {isAdmin && (
                  <th className="text-left py-2 font-normal uppercase tracking-widest">ACTIONS</th>
                )}
              </tr>
            </thead>
            <tbody>
              {passes.map((p) => (
                <tr key={p.passId} className="border-b border-border hover:bg-muted/20">
                  <td className="py-2 pr-4 text-muted-foreground">{p.passId}</td>
                  <td className="py-2 pr-4 text-foreground">{p.studentId}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{fmt(p.outTime)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{fmt(p.expectedInTime)}</td>
                  <td className="py-2 pr-4 text-foreground max-w-[150px] truncate">{p.reason}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.approverId ?? "-"}</td>
                  {isAdmin && (
                    <td className="py-2 space-x-2">
                      {p.status === "Pending" && (
                        <>
                          <button
                            onClick={() => handleApprove(p.passId)}
                            className="text-muted-foreground hover:text-primary text-xs"
                          >
                            [approve]
                          </button>
                          <button
                            onClick={() => handleReject(p.passId)}
                            className="text-muted-foreground hover:text-destructive text-xs"
                          >
                            [reject]
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {passes.length === 0 && (
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
