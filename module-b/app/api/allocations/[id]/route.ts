import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, room } from "@/lib/db";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getShardDb, getNumShards } from "@/lib/shard-router";

/**
 * Find an allocation by ID across all shards (fan-out).
 * Returns { row, shardId } or null.
 */
function findAllocationAcrossShards(allocationId: number): { row: any; shardId: number } | null {
  for (let i = 0; i < getNumShards(); i++) {
    const shardTable = `shard_${i}_allocation`;
    const row = getShardDb(i).prepare(
      `SELECT * FROM ${shardTable} WHERE allocation_id = ?`,
    ).get(allocationId);
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
  const allocationId = Number(id);

  try {
    const found = findAllocationAcrossShards(allocationId);
    if (!found) {
      return NextResponse.json(
        { error: "Allocation not found" },
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
  const allocationId = Number(id);

  try {
    const body = await request.json();
    const found = findAllocationAcrossShards(allocationId);

    if (!found) {
      return NextResponse.json({ error: "Allocation not found" }, { status: 404 });
    }

    const { row: existing, shardId } = found;
    const shardDb = getShardDb(shardId);
    const shardTable = `shard_${shardId}_allocation`;

    // Reject state transition if allocation is already closed
    const newStatus = body.status;
    if (newStatus && existing.status !== "Active") {
      return NextResponse.json(
        { error: `Cannot transition: allocation is already ${existing.status}` },
        { status: 409 },
      );
    }

    // Build dynamic UPDATE.
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (snakeKey === "allocation_id") continue;
      setClauses.push(`${snakeKey} = ?`);
      values.push(value);
    }

    if (setClauses.length > 0) {
      values.push(allocationId);
      shardDb.prepare(
        `UPDATE ${shardTable} SET ${setClauses.join(", ")} WHERE allocation_id = ?`,
      ).run(...values);
    }

    // Decrement occupancy when active allocation is closed.
    const wasActive = existing.status === "Active";
    const isNowClosed = body.status === "Completed" || body.status === "Cancelled";
    if (wasActive && isNowClosed) {
      await db
        .update(room)
        .set({ currentOccupancy: sql`max(0, ${room.currentOccupancy} - 1)` })
        .where(eq(room.roomId, existing.room_id));
    }

    logAction({
      tableName: "allocation",
      action: "UPDATE",
      recordId: allocationId,
      performedBy: session.userId,
      details: body,
    });

    const updated = shardDb.prepare(
      `SELECT * FROM ${shardTable} WHERE allocation_id = ?`,
    ).get(allocationId);

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
  const allocationId = Number(id);

  try {
    const found = findAllocationAcrossShards(allocationId);

    if (!found) {
      return NextResponse.json({ error: "Allocation not found" }, { status: 404 });
    }

    const { row: existing, shardId } = found;
    const shardDb = getShardDb(shardId);
    const shardTable = `shard_${shardId}_allocation`;

    shardDb.prepare(
      `DELETE FROM ${shardTable} WHERE allocation_id = ?`,
    ).run(allocationId);

    // Decrement occupancy if active.
    if (existing.status === "Active") {
      await db
        .update(room)
        .set({ currentOccupancy: sql`max(0, ${room.currentOccupancy} - 1)` })
        .where(eq(room.roomId, existing.room_id));
    }

    logAction({
      tableName: "allocation",
      action: "DELETE",
      recordId: allocationId,
      performedBy: session.userId,
    });

    return NextResponse.json({ message: "Allocation deleted" });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
