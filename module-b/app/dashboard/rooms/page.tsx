"use client";

import { useEffect, useState } from "react";
import { api, useAuth } from "@/lib/api";

interface Room {
  roomId: number;
  blockId: number;
  blockName?: string;
  roomNumber: string;
  floorNumber: number;
  capacity: number;
  currentOccupancy: number;
  type: "AC" | "Non-AC";
  status: "Available" | "Full" | "Maintenance";
}

const EMPTY_FORM = {
  blockId: "",
  roomNumber: "",
  floorNumber: "",
  capacity: "",
  currentOccupancy: "0",
  type: "Non-AC" as "AC" | "Non-AC",
  status: "Available" as "Available" | "Full" | "Maintenance",
};

function StatusBadge({ status }: { status: Room["status"] }) {
  const cls =
    status === "Available"
      ? "border-primary text-primary"
      : status === "Maintenance"
      ? "border-destructive text-destructive"
      : "border-border text-muted-foreground";
  return (
    <span className={`border px-1 text-[10px] ${cls}`}>{status}</span>
  );
}

export default function RoomsPage() {
  const { isAdmin } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchRooms = async () => {
    try {
      const data = await api.get("/api/rooms");
      const flattened = Array.isArray(data)
        ? data.map((item: any) => ({
            ...item.room,
            blockName: item.hostelBlock?.blockName,
          } as Room))
        : [];
      setRooms(flattened);
    } catch {
      setError("Failed to load rooms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const openCreate = () => {
    setEditingRoom(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (r: Room) => {
    setEditingRoom(r);
    setForm({
      blockId: String(r.blockId),
      roomNumber: r.roomNumber,
      floorNumber: String(r.floorNumber),
      capacity: String(r.capacity),
      currentOccupancy: String(r.currentOccupancy),
      type: r.type,
      status: r.status,
    });
    setFormError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingRoom(null);
    setFormError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    try {
      const payload = {
        blockId: Number(form.blockId),
        roomNumber: form.roomNumber,
        floorNumber: Number(form.floorNumber),
        capacity: Number(form.capacity),
        currentOccupancy: Number(form.currentOccupancy),
        type: form.type,
        status: form.status,
      };
      let result;
      if (editingRoom) {
        result = await api.put(`/api/rooms/${editingRoom.roomId}`, payload);
      } else {
        result = await api.post("/api/rooms", payload);
      }
      if (result.error) setFormError(result.error);
      else {
        closeForm();
        fetchRooms();
      }
    } catch {
      setFormError("Request failed");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this room?")) return;
    try {
      const result = await api.delete(`/api/rooms/${id}`);
      if (result.error) setError(result.error);
      else fetchRooms();
    } catch {
      setError("Delete failed");
    }
  };

  return (
    <div className="p-6">
      <div className="border-b border-border pb-5 mb-4 flex items-end justify-between">
        <div className="border-l-4 border-primary pl-4">
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase leading-none">rooms</h1>
          <p className="text-muted-foreground text-[10px] mt-1.5 tracking-widest uppercase">{rooms.length} records &nbsp;·&nbsp; block / floor / capacity</p>
        </div>
        {isAdmin && (
          <button
            id="rooms-new-btn"
            onClick={openCreate}
            className="border border-primary text-primary text-xs px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            [+ new room]
          </button>
        )}
      </div>

      {error && (
        <p className="text-primary text-xs border border-primary px-3 py-2 mb-4">✗ {error}</p>
      )}

      {showForm && (
        <div className="border border-border border-l-2 border-l-primary mb-4 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-primary uppercase tracking-widest">
              {editingRoom ? `// editing room #${editingRoom.roomId}` : "// new room"}
            </span>
            <button onClick={closeForm} className="text-xs text-muted-foreground hover:text-foreground">
              [cancel]
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            {[
              { label: "block id", key: "blockId", type: "number", required: true },
              { label: "room number", key: "roomNumber", type: "text", required: true },
              { label: "floor", key: "floorNumber", type: "number", required: true },
              { label: "capacity", key: "capacity", type: "number", required: true },
              { label: "current occupancy", key: "currentOccupancy", type: "number" },
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
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">type</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Room["type"] }))}
                className="w-full bg-background border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="Non-AC">Non-AC</option>
                <option value="AC">AC</option>
              </select>
            </div>
            <div className="space-y-0.5">
              <label className="block text-[10px] text-muted-foreground uppercase tracking-widest">status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Room["status"] }))}
                className="w-full bg-background border border-border px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="Available">Available</option>
                <option value="Full">Full</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>

            <div className="col-span-2 flex items-center gap-3 pt-1">
              {formError && <span className="text-primary text-xs flex-1">✗ {formError}</span>}
              <button
                type="submit"
                disabled={formLoading}
                className="bg-primary text-primary-foreground text-xs px-4 py-1.5 font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
              >
                {formLoading ? "saving..." : editingRoom ? "UPDATE" : "CREATE"}
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
                {["ROOM_ID", "BLOCK", "ROOM_NO", "FLOOR", "CAPACITY", "OCCUPANCY", "TYPE", "STATUS"].map((h) => (
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
              {rooms.map((r) => (
                <tr key={r.roomId} className="border-b border-border hover:bg-muted/20">
                  <td className="py-2 pr-4 text-muted-foreground">{r.roomId}</td>
                  <td className="py-2 pr-4 text-foreground">{r.blockName ?? r.blockId}</td>
                  <td className="py-2 pr-4 text-foreground">{r.roomNumber}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.floorNumber}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.capacity}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.currentOccupancy}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.type}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status} />
                  </td>
                  {isAdmin && (
                    <td className="py-2 space-x-2">
                      <button onClick={() => openEdit(r)} className="text-muted-foreground hover:text-foreground text-xs">
                        [edit]
                      </button>
                      <button onClick={() => handleDelete(r.roomId)} className="text-muted-foreground hover:text-destructive text-xs">
                        [del]
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {rooms.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="py-6 text-center text-muted-foreground">
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
