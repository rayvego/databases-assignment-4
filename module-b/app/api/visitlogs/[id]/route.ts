import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getAllShardDbs, getShardDb, getShardId } from "@/lib/shard-router";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  const { id } = await params;
  const visitId = Number(id);

  try {
    const shardDbs = getAllShardDbs();
    for (let i = 0; i < 3; i++) {
      const shardTable = `shard_${i}_visit_log`;
      const row = shardDbs[i].prepare(`SELECT * FROM ${shardTable} WHERE visit_id = ?`).get(visitId);
      if (row) return NextResponse.json(row);
    }
    return NextResponse.json({ error: "Visit log not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin(request);
  if (isNextResponse(session)) return session;

  const { id } = await params;
  const visitId = Number(id);

  try {
    const body = await request.json();

    const shardDbs = getAllShardDbs();
    for (let i = 0; i < 3; i++) {
      const shardTable = `shard_${i}_visit_log`;
      const existing = shardDbs[i].prepare(`SELECT * FROM ${shardTable} WHERE visit_id = ?`).get(visitId);
      if (existing) {
        const fields = Object.entries(body).filter(([_, v]) => v !== undefined);
        if (fields.length === 0) {
          return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }
        const setClauses = fields.map(([key]) => `${key.replace(/([A-Z])/g, "_$1").toLowerCase()} = ?`).join(", ");
        const values = fields.map(([_, v]) => v);
        values.push(visitId);

        shardDbs[i].prepare(`UPDATE ${shardTable} SET ${setClauses} WHERE visit_id = ?`).run(...values);
        const updated = shardDbs[i].prepare(`SELECT * FROM ${shardTable} WHERE visit_id = ?`).get(visitId);

        logAction({
          tableName: "visit_log",
          action: "UPDATE",
          recordId: visitId,
          performedBy: session.userId,
          details: body,
        });

        return NextResponse.json(updated);
      }
    }

    return NextResponse.json({ error: "Visit log not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin(request);
  if (isNextResponse(session)) return session;

  const { id } = await params;
  const visitId = Number(id);

  try {
    const shardDbs = getAllShardDbs();
    for (let i = 0; i < 3; i++) {
      const shardTable = `shard_${i}_visit_log`;
      const existing = shardDbs[i].prepare(`SELECT * FROM ${shardTable} WHERE visit_id = ?`).get(visitId);
      if (existing) {
        shardDbs[i].prepare(`DELETE FROM ${shardTable} WHERE visit_id = ?`).run(visitId);

        logAction({
          tableName: "visit_log",
          action: "DELETE",
          recordId: visitId,
          performedBy: session.userId,
        });

        return NextResponse.json({ message: "Visit log deleted" });
      }
    }

    return NextResponse.json({ error: "Visit log not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
