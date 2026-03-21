import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  member,
  student,
  staff,
  users,
  auditLog,
  hostelBlock,
  room,
  sqlite,
} from "@/lib/db";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getShardDb, getNumShards } from "@/lib/shard-router";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  const { id } = await params;
  const memberId = Number(id);

  try {
    const result = await db
      .select()
      .from(member)
      .where(eq(member.memberId, memberId));

    if (result.length === 0) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
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
  const memberId = Number(id);

  try {
    const body = await request.json();
    const result = await db
      .update(member)
      .set(body)
      .where(eq(member.memberId, memberId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    logAction({
      tableName: "member",
      action: "UPDATE",
      recordId: memberId,
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
  const memberId = Number(id);

  try {
    const existing = await db
      .select()
      .from(member)
      .where(eq(member.memberId, memberId));

    if (existing.length === 0) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const memberRecord = existing[0];

    // STEP 1: Delete from shard tables.
    const shardId = memberId % 3;
    const shardDb = getShardDb(shardId);

    if (memberRecord.userType === "Student") {
      // Collect affected room_ids and their allocation counts before deleting
      const affectedRooms = shardDb.prepare(
        `SELECT room_id, COUNT(*) as cnt FROM shard_${shardId}_allocation
         WHERE student_id = ? AND status = 'Active'
         GROUP BY room_id`,
      ).all(memberId) as { room_id: number; cnt: number }[];

      // Cascade through all student-dependent tables in the shard.
      shardDb.prepare(`DELETE FROM shard_${shardId}_fee_payment WHERE student_id = ?`).run(memberId);
      shardDb.prepare(`DELETE FROM shard_${shardId}_visit_log WHERE student_id = ?`).run(memberId);
      shardDb.prepare(`DELETE FROM shard_${shardId}_allocation WHERE student_id = ?`).run(memberId);
      shardDb.prepare(`DELETE FROM shard_${shardId}_gate_pass WHERE student_id = ?`).run(memberId);

      // Decrement room occupancy for each affected room — must happen AFTER
      // allocation deletes so occupancy reflects the final state
      for (const { room_id, cnt } of affectedRooms) {
        db.update(room)
          .set({ currentOccupancy: sql`MAX(0, current_occupancy - ${cnt})` })
          .where(eq(room.roomId, room_id))
          .run();
      }
    } else {
      // Staff/admin: null out nullable FK references in shard tables.
      for (let i = 0; i < getNumShards(); i++) {
        const sDb = getShardDb(i);
        sDb.prepare(`UPDATE shard_${i}_gate_pass SET approver_id = NULL WHERE approver_id = ?`).run(memberId);
        sDb.prepare(`UPDATE shard_${i}_maintenance_request SET resolved_by = NULL WHERE resolved_by = ?`).run(memberId);
      }
    }

    // Delete maintenance requests filed by this member (across all shards since reported_by determines placement).
    for (let i = 0; i < getNumShards(); i++) {
      const sDb = getShardDb(i);
      sDb.prepare(`DELETE FROM shard_${i}_maintenance_request WHERE reported_by = ?`).run(memberId);
    }

    // Delete student record from the shard.
    shardDb.prepare(`DELETE FROM shard_${shardId}_student WHERE student_id = ?`).run(memberId);

    // STEP 2: Delete from main DB (users, audit_log, member, staff).
    db.transaction((tx) => {
      const memberUsers = tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.memberId, memberId))
        .all();
      const userIds = memberUsers.map((u) => u.id);
      if (userIds.length > 0) {
        tx.delete(auditLog).where(inArray(auditLog.performedBy, userIds)).run();
      }

      if (memberRecord.userType === "Staff") {
        tx.update(hostelBlock).set({ wardenId: null }).where(eq(hostelBlock.wardenId, memberId)).run();
      }

      tx.delete(staff).where(eq(staff.staffId, memberId)).run();
      tx.delete(users).where(eq(users.memberId, memberId)).run();
      tx.delete(member).where(eq(member.memberId, memberId)).run();
    });

    logAction({
      tableName: "member",
      action: "DELETE",
      recordId: memberId,
      performedBy: session.userId,
    });

    return NextResponse.json({ message: "Member deleted" });
  } catch (error) {
    console.error("DELETE /api/members/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
