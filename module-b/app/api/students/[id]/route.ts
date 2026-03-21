import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db, member, users, auditLog, allocation, gatePass, visitLog, maintenanceRequest, feePayment, room } from "@/lib/db";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getShardDb, getShardId } from "@/lib/shard-router";
import { sqlite } from "@/lib/db";

function getStudentWithMember(shardDb: any, shardTable: string, studentId: number): any | null {
  const studentRow = shardDb.prepare(
    `SELECT * FROM ${shardTable} WHERE student_id = ?`,
  ).get(studentId);

  if (!studentRow) return null;

  const memberRow = sqlite.prepare(
    `SELECT * FROM member WHERE member_id = ?`,
  ).get(studentRow.student_id);

  return { student: studentRow, member: memberRow };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  const { id } = await params;
  const studentId = Number(id);

  try {
    const shardId = getShardId(studentId);
    const shardDb = getShardDb(shardId);
    const shardTable = `shard_${shardId}_student`;

    const result = getStudentWithMember(shardDb, shardTable, studentId);

    if (!result) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }
    return NextResponse.json(result);
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
  const studentId = Number(id);

  try {
    const body = await request.json();
    const shardId = getShardId(studentId);
    const shardDb = getShardDb(shardId);
    const shardTable = `shard_${shardId}_student`;

    // Check existence.
    const existing = shardDb.prepare(
      `SELECT * FROM ${shardTable} WHERE student_id = ?`,
    ).get(studentId);

    if (!existing) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Build dynamic UPDATE.
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (snakeKey === "student_id") continue;
      setClauses.push(`${snakeKey} = ?`);
      values.push(value);
    }

    if (setClauses.length > 0) {
      values.push(studentId);
      shardDb.prepare(
        `UPDATE ${shardTable} SET ${setClauses.join(", ")} WHERE student_id = ?`,
      ).run(...values);
    }

    logAction({
      tableName: "student",
      action: "UPDATE",
      recordId: studentId,
      performedBy: session.userId,
      details: body,
    });

    const updated = shardDb.prepare(
      `SELECT * FROM ${shardTable} WHERE student_id = ?`,
    ).get(studentId);

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
  const studentId = Number(id);

  try {
    const shardId = getShardId(studentId);
    const shardDb = getShardDb(shardId);

    // Check existence in the correct shard.
    const shardTable = `shard_${shardId}_student`;
    const existing = shardDb.prepare(
      `SELECT * FROM ${shardTable} WHERE student_id = ?`,
    ).get(studentId);

    if (!existing) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // STEP 1: Collect affected room_ids and their active allocation counts
    // before deleting, so we can decrement occupancy afterwards.
    const affectedRooms = shardDb.prepare(
      `SELECT room_id, COUNT(*) as cnt FROM shard_${shardId}_allocation
       WHERE student_id = ? AND status = 'Active'
       GROUP BY room_id`,
    ).all(studentId) as { room_id: number; cnt: number }[];

    // STEP 2: Delete from main DB (users, audit_log, member).
    const memberUsers = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.memberId, studentId))
      .all();
    const userIds = memberUsers.map((u) => u.id);
    if (userIds.length > 0) {
      db.delete(auditLog).where(inArray(auditLog.performedBy, userIds)).run();
    }
    db.delete(users).where(eq(users.memberId, studentId)).run();
    db.delete(member).where(eq(member.memberId, studentId)).run();

    // STEP 4: Delete from sharded tables in the same shard.
    shardDb.prepare(`DELETE FROM shard_${shardId}_allocation WHERE student_id = ?`).run(studentId);
    shardDb.prepare(`DELETE FROM shard_${shardId}_gate_pass WHERE student_id = ?`).run(studentId);
    shardDb.prepare(`DELETE FROM shard_${shardId}_fee_payment WHERE student_id = ?`).run(studentId);
    shardDb.prepare(`DELETE FROM shard_${shardId}_visit_log WHERE student_id = ?`).run(studentId);
    shardDb.prepare(`DELETE FROM shard_${shardId}_maintenance_request WHERE reported_by = ?`).run(studentId);
    shardDb.prepare(`DELETE FROM ${shardTable} WHERE student_id = ?`).run(studentId);

    // STEP 5: Decrement room occupancy for each affected room.
    for (const { room_id, cnt } of affectedRooms) {
      db.update(room)
        .set({ currentOccupancy: sql`MAX(0, current_occupancy - ${cnt})` })
        .where(eq(room.roomId, room_id))
        .run();
    }

    logAction({
      tableName: "student",
      action: "DELETE",
      recordId: studentId,
      performedBy: session.userId,
    });

    return NextResponse.json({ message: "Student deleted" });
  } catch (error) {
    console.error("DELETE /api/students/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
