"use client";

import { api, useAuth } from "@/lib/api";
import { useEffect, useState } from "react";

interface Member {
  memberId: number;
  name: string;
  email: string;
  contactNumber: string;
  age: number;
  gender: "Male" | "Female" | "Other";
  address?: string;
  profileImage?: string;
  userType: "Student" | "Staff" | "Admin";
  createdAt?: string;
}

const EMPTY_FORM: Omit<Member, "memberId" | "createdAt"> = {
  name: "",
  email: "",
  contactNumber: "",
  age: 0,
  gender: "Male",
  address: "",
  profileImage: "",
  userType: "Student",
};

export default function MembersPage() {
  const { isAdmin } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchMembers = async () => {
    try {
      const data = await api.get("/api/members");
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const openCreate = () => {
    setEditingMember(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (m: Member) => {
    setEditingMember(m);
    setForm({
      name: m.name,
      email: m.email,
      contactNumber: m.contactNumber,
      age: m.age,
      gender: m.gender,
      address: m.address || "",
      profileImage: m.profileImage || "",
      userType: m.userType,
    });
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingMember(null);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    try {
      const payload = { ...form, age: Number(form.age) };
      let result;
      if (editingMember) {
        result = await api.put(`/api/members/${editingMember.memberId}`, payload);
      } else {
        result = await api.post("/api/members", payload);
      }
      if (result.error) {
        setFormError(result.error);
      } else {
        closeForm();
        fetchMembers();
      }
    } catch {
      setFormError("Request failed");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this member?")) return;
    try {
      const result = await api.delete(`/api/members/${id}`);
      if (result.error) {
        setError(result.error);
      } else {
        fetchMembers();
      }
    } catch {
      setError("Delete failed");
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatDate = (val?: string | number | null) => {
    if (!val) return "-";
    const d = new Date(typeof val === "number" ? val * 1000 : val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="border-b border-border pb-5 mb-4 flex items-end justify-between">
        <div className="border-l-4 border-primary pl-4">
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase leading-none">
            members
          </h1>
          <p className="text-muted-foreground text-[10px] mt-1.5 tracking-widest uppercase">
            {members.length} records &nbsp;·&nbsp; resident portfolio
          </p>
        </div>
        {isAdmin && (
          <button
            id="members-new-btn"
            onClick={openCreate}
            className="border border-primary text-primary text-xs px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            [+ new member]
          </button>
        )}
      </div>

      {error && (
        <p className="text-primary text-xs border border-primary px-3 py-2 mb-4">
          ✗ {error}
        </p>
      )}

      {/* Inline Form */}
      {showForm && (
        <div className="border border-border border-l-2 border-l-primary mb-4 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-primary uppercase tracking-widest">
              {editingMember ? `// editing member #${editingMember.memberId}` : "// new member"}
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
              { label: "name", key: "name", type: "text", required: true },
              { label: "email", key: "email", type: "email", required: true },
              { label: "contact", key: "contactNumber", type: "text", required: true },
              { label: "age", key: "age", type: "number", required: true },
              { label: "address", key: "address", type: "text" },
              { label: "profile image url", key: "profileImage", type: "text" },
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
                gender
              </label>
              <select
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as Member["gender"] }))}
                className="w-full bg-background border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-0.5">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">
                type
              </label>
              <select
                value={form.userType}
                onChange={(e) => setForm((f) => ({ ...f, userType: e.target.value as Member["userType"] }))}
                className="w-full bg-background border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="Student">Student</option>
                <option value="Staff">Staff</option>
                <option value="Admin">Admin</option>
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
                {formLoading ? "saving..." : editingMember ? "UPDATE" : "CREATE"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-muted-foreground text-sm">loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 pr-4 font-normal uppercase tracking-widest">ID</th>
                <th className="text-left py-2 pr-4 font-normal uppercase tracking-widest">NAME</th>
                <th className="text-left py-2 pr-4 font-normal uppercase tracking-widest">EMAIL</th>
                <th className="text-left py-2 pr-4 font-normal uppercase tracking-widest">CONTACT</th>
                <th className="text-left py-2 pr-4 font-normal uppercase tracking-widest">TYPE</th>
                <th className="text-left py-2 pr-4 font-normal uppercase tracking-widest">AGE</th>
                <th className="text-left py-2 pr-4 font-normal uppercase tracking-widest">GENDER</th>
                <th className="text-left py-2 pr-4 font-normal uppercase tracking-widest">JOINED</th>
                {isAdmin && (
                  <th className="text-left py-2 font-normal uppercase tracking-widest">ACTIONS</th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <>
                  <tr
                    key={m.memberId}
                    className="border-b border-border hover:bg-muted/20 cursor-pointer"
                    onClick={() => toggleExpand(m.memberId)}
                  >
                    <td className="py-2 pr-4 text-muted-foreground">{m.memberId}</td>
                    <td className="py-2 pr-4 text-foreground">{m.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{m.email}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{m.contactNumber}</td>
                    <td className="py-2 pr-4">
                      <span className="border border-border text-muted-foreground px-1">
                        {m.userType}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{m.age}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{m.gender}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatDate(m.createdAt)}</td>
                    {isAdmin && (
                      <td className="py-2 space-x-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openEdit(m)}
                          className="text-muted-foreground hover:text-foreground text-xs"
                        >
                          [edit]
                        </button>
                        <button
                          onClick={() => handleDelete(m.memberId)}
                          className="text-muted-foreground hover:text-destructive text-xs"
                        >
                          [del]
                        </button>
                      </td>
                    )}
                  </tr>

                  {/* Inline expanded detail */}
                  {expandedId === m.memberId && (
                    <tr key={`exp-${m.memberId}`} className="border-b border-border">
                      <td
                        colSpan={isAdmin ? 9 : 8}
                        className="py-3 px-4 bg-muted/10"
                      >
                        <div className="flex gap-6 items-start">
                          {m.profileImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.profileImage}
                              alt={m.name}
                              className="w-16 h-16 object-cover border border-border shrink-0"
                            />
                          )}
                          <div className="space-y-1 text-xs">
                            <div>
                              <span className="text-muted-foreground uppercase tracking-widest text-[10px]">
                                address:{" "}
                              </span>
                              <span className="text-foreground">
                                {m.address || "-"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground uppercase tracking-widest text-[10px]">
                                member_id:{" "}
                              </span>
                              <span className="text-foreground">{m.memberId}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground uppercase tracking-widest text-[10px]">
                                full_email:{" "}
                              </span>
                              <span className="text-foreground">{m.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {members.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 9 : 8}
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
