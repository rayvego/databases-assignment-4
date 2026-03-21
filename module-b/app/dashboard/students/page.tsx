"use client";

import { api, useAuth } from "@/lib/api";
import { useEffect, useState } from "react";

interface Student {
  studentId: number;
  enrollmentNo: string;
  course: string;
  batchYear: number;
  guardianName: string;
  guardianContact: string;
  // joined from member:
  name?: string;
  memberId?: number;
}

interface StudentWithMember extends Student {
  name: string;
}

const EMPTY_FORM = {
  // member fields
  name: "",
  email: "",
  contactNumber: "",
  age: "",
  gender: "Male" as "Male" | "Female" | "Other",
  address: "",
  profileImage: "",
  userType: "Student" as const,
  // student-specific
  enrollmentNo: "",
  course: "",
  batchYear: "",
  guardianName: "",
  guardianContact: "",
};

export default function StudentsPage() {
  const { isAdmin } = useAuth();
  const [students, setStudents] = useState<StudentWithMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchStudents = async () => {
    try {
      const data = await api.get("/api/students");
      const flattened = Array.isArray(data)
        ? data.map((item: any) => ({
            ...item.student,
            ...item.member,
          } as StudentWithMember))
        : [];
      setStudents(flattened);
    } catch {
      setError("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const openCreate = () => {
    setEditingStudent(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (s: StudentWithMember) => {
    setEditingStudent(s);
    setForm({
      name: s.name || "",
      email: "",
      contactNumber: "",
      age: "",
      gender: "Male",
      address: "",
      profileImage: "",
      userType: "Student",
      enrollmentNo: s.enrollmentNo,
      course: s.course,
      batchYear: String(s.batchYear),
      guardianName: s.guardianName,
      guardianContact: s.guardianContact,
    });
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingStudent(null);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    try {
      let result;
      if (editingStudent) {
        result = await api.put(`/api/students/${editingStudent.studentId}`, {
          enrollmentNo: form.enrollmentNo,
          course: form.course,
          batchYear: Number(form.batchYear),
          guardianName: form.guardianName,
          guardianContact: form.guardianContact,
        });
      } else {
        result = await api.post("/api/students", {
          name: form.name,
          email: form.email,
          contactNumber: form.contactNumber,
          age: Number(form.age),
          gender: form.gender,
          address: form.address,
          profileImage: form.profileImage,
          userType: "Student",
          enrollmentNo: form.enrollmentNo,
          course: form.course,
          batchYear: Number(form.batchYear),
          guardianName: form.guardianName,
          guardianContact: form.guardianContact,
        });
      }
      if (result.error) {
        setFormError(result.error);
      } else {
        closeForm();
        fetchStudents();
      }
    } catch {
      setFormError("Request failed");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this student?")) return;
    try {
      const result = await api.delete(`/api/students/${id}`);
      if (result.error) setError(result.error);
      else fetchStudents();
    } catch {
      setError("Delete failed");
    }
  };

  const formField = (
    label: string,
    key: keyof typeof form,
    type = "text",
    required = false
  ) => (
    <div key={key} className="space-y-0.5">
      <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">
        {label}
      </label>
      <input
        type={type}
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        required={required}
        className="w-full bg-transparent border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
      />
    </div>
  );

  return (
    <div className="p-6">
      <div className="border-b border-border pb-5 mb-4 flex items-end justify-between">
        <div className="border-l-4 border-primary pl-4">
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase leading-none">students</h1>
          <p className="text-muted-foreground text-[10px] mt-1.5 tracking-widest uppercase">{students.length} records &nbsp;·&nbsp; enrollment data</p>
        </div>
        {isAdmin && (
          <button
            id="students-new-btn"
            onClick={openCreate}
            className="border border-primary text-primary text-xs px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            [+ new student]
          </button>
        )}
      </div>

      {error && (
        <p className="text-primary text-xs border border-primary px-3 py-2 mb-4">✗ {error}</p>
      )}

      {/* Inline Form */}
      {showForm && (
        <div className="border border-border border-l-2 border-l-primary mb-4 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-primary uppercase tracking-widest">
              {editingStudent ? `// editing student #${editingStudent.studentId}` : "// new student"}
            </span>
            <button onClick={closeForm} className="text-xs text-muted-foreground hover:text-foreground">
              [cancel]
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            {!editingStudent && (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
                  - member fields -
                </p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {formField("name", "name", "text", true)}
                  {formField("email", "email", "email", true)}
                  {formField("contact", "contactNumber", "text", true)}
                  {formField("age", "age", "number", true)}
                  {formField("address", "address")}
                  {formField("profile image url", "profileImage")}
                  <div className="space-y-0.5">
                    <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">gender</label>
                    <select
                      value={form.gender}
                      onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as typeof form.gender }))}
                      className="w-full bg-background border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </>
            )}
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
              - student fields -
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {formField("enrollment no", "enrollmentNo", "text", true)}
              {formField("course", "course", "text", true)}
              {formField("batch year", "batchYear", "number", true)}
              {formField("guardian name", "guardianName", "text", true)}
              {formField("guardian contact", "guardianContact", "text", true)}
            </div>
            <div className="flex items-center gap-3">
              {formError && <span className="text-primary text-xs flex-1">✗ {formError}</span>}
              <button
                type="submit"
                disabled={formLoading}
                className="bg-primary text-primary-foreground text-xs px-4 py-1.5 font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
              >
                {formLoading ? "saving..." : editingStudent ? "UPDATE" : "CREATE"}
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
                {["ID", "ENROLLMENT", "NAME", "COURSE", "BATCH", "GUARDIAN"].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 font-normal uppercase tracking-widest">
                    {h}
                  </th>
                ))}
                {isAdmin && (
                  <th className="text-left py-2 font-normal uppercase tracking-widest">ACTIONS</th>
                )}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.studentId} className="border-b border-border hover:bg-muted/20">
                  <td className="py-2 pr-4 text-muted-foreground">{s.studentId}</td>
                  <td className="py-2 pr-4 text-foreground">{s.enrollmentNo}</td>
                  <td className="py-2 pr-4 text-foreground">{s.name || "-"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{s.course}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{s.batchYear}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{s.guardianName}</td>
                  {isAdmin && (
                    <td className="py-2 space-x-2">
                      <button
                        onClick={() => openEdit(s)}
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        [edit]
                      </button>
                      <button
                        onClick={() => handleDelete(s.studentId)}
                        className="text-muted-foreground hover:text-destructive text-xs"
                      >
                        [del]
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="py-6 text-center text-muted-foreground">
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
