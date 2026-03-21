import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getShardDb, getNumShards } from "@/lib/shard-router";

function findMaintenanceAcrossShards(requestId: number): { row: any; shardId: number } | null {
  for (let i = 0; i < getNumShards(); i++) {
    const shardTable = `shard_${i}_maintenance_request`;
    const row = getShardDb(i).prepare(
      `SELECT * FROM ${shardTable} WHERE request_id = ?`,
    ).get(requestId);
    if (row) return { row, shardId: i };
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  const { id } = await params;
  const requestId = Number(id);

  try {
    const found = findMaintenanceAcrossShards(requestId);
    if (!found) {
      return NextResponse.json(
        { error: "Maintenance request not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(found.row);
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
  const requestId = Number(id);

  try {
    const body = await request.json();
    const found = findMaintenanceAcrossShards(requestId);

    if (!found) {
      return NextResponse.json(
        { error: "Maintenance request not found" },
        { status: 404 },
      );
    }

    const shardDb = getShardDb(found.shardId);
    const shardTable = `shard_${found.shardId}_maintenance_request`;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (snakeKey === "request_id") continue;
      setClauses.push(`${snakeKey} = ?`);
      values.push(value);
    }

    if (setClauses.length > 0) {
      values.push(requestId);
      shardDb.prepare(
        `UPDATE ${shardTable} SET ${setClauses.join(", ")} WHERE request_id = ?`,
      ).run(...values);
    }

    const updated = shardDb.prepare(
      `SELECT * FROM ${shardTable} WHERE request_id = ?`,
    ).get(requestId);

    if (!updated) {
      return NextResponse.json(
        { error: "Maintenance request not found" },
        { status: 404 },
      );
    }

    logAction({
      tableName: "maintenance_request",
      action: "UPDATE",
      recordId: requestId,
      performedBy: session.userId,
      details: body,
    });

    return NextResponse.json(updated);
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
  const requestId = Number(id);

  try {
    const found = findMaintenanceAcrossShards(requestId);
    if (!found) {
      return NextResponse.json(
        { error: "Maintenance request not found" },
        { status: 404 },
      );
    }

    const shardDb = getShardDb(found.shardId);
    const shardTable = `shard_${found.shardId}_maintenance_request`;

    shardDb.prepare(
      `DELETE FROM ${shardTable} WHERE request_id = ?`,
    ).run(requestId);

    logAction({
      tableName: "maintenance_request",
      action: "DELETE",
      recordId: requestId,
      performedBy: session.userId,
    });

    return NextResponse.json({ message: "Maintenance request deleted" });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
