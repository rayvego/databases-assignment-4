"use client";

import { api, useAuth } from "@/lib/api";
import { useEffect, useState } from "react";

interface FeePayment {
  paymentId: number;
  studentId: number;
  amount: number;
  paymentDate: string;
  paymentType: "Hostel_Fee" | "Security_Deposit" | "Fine" | "Other";
  status: "Success" | "Failed" | "Pending";
}

const EMPTY_FORM = {
  studentId: "",
  amount: "",
  paymentDate: "",
  paymentType: "Hostel_Fee" as FeePayment["paymentType"],
  status: "Pending" as FeePayment["status"],
};

function StatusBadge({ status }: { status: FeePayment["status"] }) {
  const cls =
    status === "Success"
      ? "border-primary text-primary"
      : status === "Failed"
      ? "border-destructive text-destructive"
      : "border-border text-muted-foreground";
  return <span className={`border px-1 text-[10px] ${cls}`}>{status}</span>;
}

export default function FeesPage() {
  const { isAdmin } = useAuth();
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<FeePayment | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchPayments = async () => {
    try {
      const data = await api.get("/api/fees");
      setPayments(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load fee payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const openCreate = () => {
    setEditingPayment(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (p: FeePayment) => {
    setEditingPayment(p);
    setForm({
      studentId: String(p.studentId),
      amount: String(p.amount),
      paymentDate: p.paymentDate,
      paymentType: p.paymentType,
      status: p.status,
    });
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingPayment(null);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    try {
      const payload = {
        studentId: Number(form.studentId),
        amount: Number(form.amount),
        paymentDate: form.paymentDate,
        paymentType: form.paymentType,
        status: form.status,
      };
      let result;
      if (editingPayment) {
        result = await api.put(`/api/fees/${editingPayment.paymentId}`, payload);
      } else {
        result = await api.post("/api/fees", payload);
      }
      if (result.error) setFormError(result.error);
      else {
        closeForm();
        fetchPayments();
      }
    } catch {
      setFormError("Request failed");
    } finally {
      setFormLoading(false);
    }
  };

  const fmt = (v?: string) => (v ? new Date(v).toLocaleDateString() : "-");

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-primary text-xs border border-primary px-3 py-2">
          ✗ Admin access required to view fee payments.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="border-b border-border pb-5 mb-4 flex items-end justify-between">
        <div className="border-l-4 border-primary pl-4">
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase leading-none">
            fee_payments
          </h1>
          <p className="text-muted-foreground text-[10px] mt-1.5 tracking-widest uppercase">
            {payments.length} records &nbsp;·&nbsp; student payment history
          </p>
        </div>
        <button
          id="fees-new-btn"
          onClick={openCreate}
          className="border border-primary text-primary text-xs px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          [+ new payment]
        </button>
      </div>

      {error && (
        <p className="text-primary text-xs border border-primary px-3 py-2 mb-4">
          ✗ {error}
        </p>
      )}

      {showForm && (
        <div className="border border-border border-l-2 border-l-primary mb-4 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-primary uppercase tracking-widest">
              {editingPayment
                ? `// editing payment #${editingPayment.paymentId}`
                : "// new payment"}
            </span>
            <button
              onClick={closeForm}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              [cancel]
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            {[
              { label: "student id", key: "studentId", type: "number", required: true },
              { label: "amount (₹)", key: "amount", type: "number", required: true },
              { label: "payment date", key: "paymentDate", type: "date", required: true },
            ].map(({ label, key, type, required }) => (
              <div key={key} className="space-y-0.5">
                <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">
                  {label}
                </label>
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
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">
                payment type
              </label>
              <select
                value={form.paymentType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentType: e.target.value as FeePayment["paymentType"] }))
                }
                className="w-full bg-background border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="Hostel_Fee">Hostel_Fee</option>
                <option value="Security_Deposit">Security_Deposit</option>
                <option value="Fine">Fine</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-0.5">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">
                status
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as FeePayment["status"] }))
                }
                className="w-full bg-background border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="Pending">Pending</option>
                <option value="Success">Success</option>
                <option value="Failed">Failed</option>
              </select>
            </div>

            <div className="col-span-2 flex items-center gap-3 pt-1">
              {formError && (
                <span className="text-primary text-xs flex-1">✗ {formError}</span>
              )}
              <button
                type="submit"
                disabled={formLoading}
                className="bg-primary text-primary-foreground text-xs px-4 py-1.5 font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
              >
                {formLoading ? "saving..." : editingPayment ? "UPDATE" : "CREATE"}
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
                {["ID", "STUDENT_ID", "AMOUNT", "DATE", "TYPE", "STATUS", "ACTIONS"].map((h) => (
                  <th
                    key={h}
                    className="text-left py-2 pr-4 font-normal uppercase tracking-widest"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.paymentId} className="border-b border-border hover:bg-muted/20">
                  <td className="py-2 pr-4 text-muted-foreground">{p.paymentId}</td>
                  <td className="py-2 pr-4 text-foreground">{p.studentId}</td>
                  <td className="py-2 pr-4 text-foreground font-bold">
                    ₹{p.amount.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{fmt(p.paymentDate)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.paymentType}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="py-2 space-x-2">
                    <button
                      onClick={() => openEdit(p)}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      [edit]
                    </button>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
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
