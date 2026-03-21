"use client";

import { api, useAuth } from "@/lib/api";
import { useEffect, useState } from "react";

interface Allocation {
  allocationId: number;
  studentId: number;
  roomId: number;
  checkInDate: string;
  checkOutDate?: string;
  status: "Active" | "Completed" | "Cancelled";
}

const EMPTY_FORM = {
  studentId: "",
  roomId: "",
  checkInDate: "",
  checkOutDate: "",
  status: "Active" as Allocation["status"],
};

function StatusBadge({ status }: { status: Allocation["status"] }) {
  const cls =
    status === "Active"
      ? "border-primary text-primary"
      : status === "Cancelled"
      ? "border-destructive text-destructive"
      : "border-border text-muted-foreground";
  return <span className={`border px-1 text-[10px] ${cls}`}>{status}</span>;
}

export default function AllocationsPage() {
  const { isAdmin } = useAuth();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingAlloc, setEditingAlloc] = useState<Allocation | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchAllocations = async () => {
    try {
      const data = await api.get("/api/allocations");
      setAllocations(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load allocations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllocations();
  }, []);

  const openCreate = () => {
    setEditingAlloc(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (a: Allocation) => {
    setEditingAlloc(a);
    setForm({
      studentId: String(a.studentId),
      roomId: String(a.roomId),
      checkInDate: a.checkInDate,
      checkOutDate: a.checkOutDate || "",
      status: a.status,
    });
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingAlloc(null);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    try {
      const payload = {
        studentId: Number(form.studentId),
        roomId: Number(form.roomId),
        checkInDate: form.checkInDate,
        checkOutDate: form.checkOutDate || null,
        status: form.status,
      };
      let result;
      if (editingAlloc) {
        result = await api.put(`/api/allocations/${editingAlloc.allocationId}`, payload);
      } else {
        result = await api.post("/api/allocations", payload);
      }
      if (result.error) setFormError(result.error);
      else {
        closeForm();
        fetchAllocations();
      }
    } catch {
      setFormError("Request failed");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this allocation?")) return;
    try {
      const result = await api.delete(`/api/allocations/${id}`);
      if (result.error) setError(result.error);
      else fetchAllocations();
    } catch {
      setError("Delete failed");
    }
  };

  const fmt = (v?: string) => (v ? new Date(v).toLocaleDateString() : "-");

  return (
    <div className="p-6">
      <div className="border-b border-border pb-5 mb-4 flex items-end justify-between">
        <div className="border-l-4 border-primary pl-4">
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase leading-none">allocations</h1>
          <p className="text-muted-foreground text-[10px] mt-1.5 tracking-widest uppercase">{allocations.length} records &nbsp;·&nbsp; check-in / check-out</p>
        </div>
        {isAdmin && (
          <button
            id="allocations-new-btn"
            onClick={openCreate}
            className="border border-primary text-primary text-xs px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            [+ new allocation]
          </button>
        )}
      </div>

      {error && (
        <p className="text-primary text-xs border border-primary px-3 py-2 mb-4">✗ {error}</p>
      )}

      {showForm && isAdmin && (
        <div className="border border-border border-l-2 border-l-primary mb-4 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-primary uppercase tracking-widest">
              {editingAlloc ? `// editing allocation #${editingAlloc.allocationId}` : "// new allocation"}
            </span>
            <button onClick={closeForm} className="text-xs text-muted-foreground hover:text-foreground">
              [cancel]
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            {[
              { label: "student id", key: "studentId", type: "number", required: true },
              { label: "room id", key: "roomId", type: "number", required: true },
              { label: "check in date", key: "checkInDate", type: "date", required: true },
              { label: "check out date", key: "checkOutDate", type: "date" },
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

            <div className="space-y-0.5">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Allocation["status"] }))}
                className="w-full bg-background border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div className="col-span-2 flex items-center gap-3 pt-1">
              {formError && <span className="text-primary text-xs flex-1">✗ {formError}</span>}
              <button
                type="submit"
                disabled={formLoading}
                className="bg-primary text-primary-foreground text-xs px-4 py-1.5 font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
              >
                {formLoading ? "saving..." : editingAlloc ? "UPDATE" : "CREATE"}
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
                {["ID", "STUDENT_ID", "ROOM_ID", "CHECK_IN", "CHECK_OUT", "STATUS"].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 font-normal uppercase tracking-widest">{h}</th>
                ))}
                {isAdmin && (
                  <th className="text-left py-2 font-normal uppercase tracking-widest">ACTIONS</th>
                )}
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.allocationId} className="border-b border-border hover:bg-muted/20">
                  <td className="py-2 pr-4 text-muted-foreground">{a.allocationId}</td>
                  <td className="py-2 pr-4 text-foreground">{a.studentId}</td>
                  <td className="py-2 pr-4 text-foreground">{a.roomId}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{fmt(a.checkInDate)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{fmt(a.checkOutDate)}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={a.status} />
                  </td>
                  {isAdmin && (
                    <td className="py-2 space-x-2">
                      <button
                        onClick={() => openEdit(a)}
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        [edit]
                      </button>
                      <button
                        onClick={() => handleDelete(a.allocationId)}
                        className="text-muted-foreground hover:text-destructive text-xs"
                      >
                        [del]
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {allocations.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 7 : 6}
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
