import { logAction } from "@/lib/audit";
import { db, room } from "@/lib/db";
import { isNextResponse, requireAdmin, requireAuth } from "@/lib/middleware";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getShardDb, getNumShards } from "@/lib/shard-router";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  const { id } = await params;
  const roomId = Number(id);

  try {
    const result = await db.select().from(room).where(eq(room.roomId, roomId));

    if (result.length === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    return NextResponse.json(result[0]);
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
  const roomId = Number(id);

  try {
    const body = await request.json();
    const result = await db
      .update(room)
      .set(body)
      .where(eq(room.roomId, roomId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    logAction({
      tableName: "room",
      action: "UPDATE",
      recordId: roomId,
      performedBy: session.userId,
      details: body,
    });

    return NextResponse.json(result[0]);
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
  const roomId = Number(id);

  try {
    const existing = await db.select().from(room).where(eq(room.roomId, roomId));

    if (existing.length === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Cascade through shard tables before deleting room from main DB.
    for (let i = 0; i < getNumShards(); i++) {
      const shardDb = getShardDb(i);
      // Count active allocations per room so we can decrement occupancy
      const affectedRooms = shardDb.prepare(
        `SELECT room_id, COUNT(*) as cnt FROM shard_${i}_allocation
         WHERE room_id = ? AND status = 'Active'
         GROUP BY room_id`,
      ).all(roomId) as { room_id: number; cnt: number }[];

      // Delete dependent allocations.
      shardDb.prepare(`DELETE FROM shard_${i}_allocation WHERE room_id = ?`).run(roomId);
      // maintenance_request.room_id is nullable. Null it out.
      shardDb.prepare(`UPDATE shard_${i}_maintenance_request SET room_id = NULL WHERE room_id = ?`).run(roomId);

      // Decrement occupancy for each affected room
      for (const { cnt } of affectedRooms) {
        await db
          .update(room)
          .set({ currentOccupancy: sql`MAX(0, current_occupancy - ${cnt})` })
          .where(eq(room.roomId, roomId));
      }
    }

    db.transaction((tx) => {
      tx.delete(room).where(eq(room.roomId, roomId)).run();
    });

    logAction({
      tableName: "room",
      action: "DELETE",
      recordId: roomId,
      performedBy: session.userId,
    });

    return NextResponse.json({ message: "Room deleted" });
  } catch (error) {
    console.error("DELETE /api/rooms/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
