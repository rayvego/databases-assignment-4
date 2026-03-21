import { NextRequest, NextResponse } from "next/server";
import { eq, sql, and } from "drizzle-orm";
import { db, room } from "@/lib/db";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getNextGlobalId } from "@/lib/global-id-sequence";
import { getShardDb, getShardId, getAllShardDbs, getNumShards } from "@/lib/shard-router";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  try {
    const url = new URL(request.url);
    const studentIdFilter = url.searchParams.get("studentId");
    const studentId = studentIdFilter ? Number(studentIdFilter) : null;
    const statusFilter = url.searchParams.get("status");

    const allAllocations: any[] = [];
    const shardDbs = getAllShardDbs();

    // If studentId is provided, compute the shard directly. No fan-out.
    if (studentId !== null) {
      const shardId = getShardId(studentId);
      const shardTable = `shard_${shardId}_allocation`;
      const rows = shardDbs[shardId].prepare(`SELECT * FROM ${shardTable}`).all() as any[];
      for (const row of rows) {
        if (row.student_id !== studentId) continue;
        if (statusFilter && row.status !== statusFilter) continue;
        allAllocations.push(row);
      }
    } else {
      // No shard key. Fan out to all shards.
      for (let i = 0; i < getNumShards(); i++) {
        const shardTable = `shard_${i}_allocation`;
        const rows = shardDbs[i].prepare(`SELECT * FROM ${shardTable}`).all() as any[];
        for (const row of rows) {
          if (statusFilter && row.status !== statusFilter) continue;
          allAllocations.push(row);
        }
      }
    }

    return NextResponse.json(allAllocations);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (isNextResponse(session)) return session;

  try {
    const body = await request.json();
    const roomId = body.roomId;
    const studentId = body.studentId;

    // STEP 1: Atomically increment room occupancy. main DB is the global reference.
    const updateResult = await db
      .update(room)
      .set({ currentOccupancy: sql`current_occupancy + 1` })
      .where(and(
        eq(room.roomId, roomId),
        sql`current_occupancy < capacity`
      ))
      .returning();

    if (updateResult.length === 0) {
      const roomCheck = await db.select().from(room).where(eq(room.roomId, roomId));
      if (roomCheck.length === 0) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Room is at full capacity" },
        { status: 409 },
      );
    }

    // STEP 2: Route to correct shard based on student_id.
    const shardId = getShardId(studentId);
    const shardDb = getShardDb(shardId);
    const shardTable = `shard_${shardId}_allocation`;

    let newAllocation: any;
    try {
      const allocId = getNextGlobalId("allocation");

      shardDb.prepare(
        `INSERT INTO ${shardTable} (allocation_id, student_id, room_id, check_in_date, check_out_date, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(allocId, body.studentId, body.roomId, body.checkInDate, body.checkOutDate || null, body.status || "Active");

      newAllocation = {
        allocationId: allocId,
        studentId: body.studentId,
        roomId: body.roomId,
        checkInDate: body.checkInDate,
        checkOutDate: body.checkOutDate,
        status: body.status || "Active",
      };
    } catch (insertError) {
      // Rollback: decrement occupancy since INSERT failed.
      await db
        .update(room)
        .set({ currentOccupancy: sql`current_occupancy - 1` })
        .where(eq(room.roomId, roomId));
      throw insertError;
    }

    logAction({
      tableName: "allocation",
      action: "INSERT",
      recordId: newAllocation.allocationId,
      performedBy: session.userId,
      details: {
        studentId: newAllocation.studentId,
        roomId: newAllocation.roomId,
      },
    });

    return NextResponse.json(newAllocation, { status: 201 });
  } catch (error) {
    console.error("POST /api/allocations:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
