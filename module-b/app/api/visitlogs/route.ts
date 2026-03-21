import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getNextGlobalId } from "@/lib/global-id-sequence";
import { getAllShardDbs, getShardDb, getNumShards, getShardId } from "@/lib/shard-router";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  try {
    const url = new URL(request.url);
    const studentIdFilter = url.searchParams.get("studentId");
    const studentId = studentIdFilter ? Number(studentIdFilter) : null;
    const visitorIdFilter = url.searchParams.get("visitorId");

    const allVisits: any[] = [];
    const shardDbs = getAllShardDbs();

    if (studentId !== null) {
      const shardId = getShardId(studentId);
      const shardTable = `shard_${shardId}_visit_log`;
      const rows = shardDbs[shardId].prepare(`SELECT * FROM ${shardTable}`).all() as any[];
      for (const row of rows) {
        if (row.student_id !== studentId) continue;
        if (visitorIdFilter && row.visitor_id !== Number(visitorIdFilter)) continue;
        allVisits.push(row);
      }
    } else {
      for (let i = 0; i < getNumShards(); i++) {
        const shardTable = `shard_${i}_visit_log`;
        const rows = shardDbs[i].prepare(`SELECT * FROM ${shardTable}`).all() as any[];
        for (const row of rows) {
          if (studentIdFilter && row.student_id !== Number(studentIdFilter)) continue;
          if (visitorIdFilter && row.visitor_id !== Number(visitorIdFilter)) continue;
          allVisits.push(row);
        }
      }
    }

    return NextResponse.json(allVisits);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (isNextResponse(session)) return session;

  try {
    const body = await request.json();
    const studentId = body.studentId;

    const shardId = getShardId(studentId);
    const shardDb = getShardDb(shardId);
    const shardTable = `shard_${shardId}_visit_log`;

    const visitId = getNextGlobalId("visit_log");

    shardDb.prepare(
      `INSERT INTO ${shardTable} (visit_id, visitor_id, student_id, check_in_time, check_out_time, purpose)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(visitId, body.visitorId, studentId, body.checkInTime, body.checkOutTime || null, body.purpose || null);

    const newVisit = {
      visitId,
      visitorId: body.visitorId,
      studentId,
      checkInTime: body.checkInTime,
      checkOutTime: body.checkOutTime,
      purpose: body.purpose,
    };

    logAction({
      tableName: "visit_log",
      action: "INSERT",
      recordId: newVisit.visitId,
      performedBy: session.userId,
      details: { studentId: newVisit.studentId, visitorId: newVisit.visitorId },
    });

    return NextResponse.json(newVisit, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
