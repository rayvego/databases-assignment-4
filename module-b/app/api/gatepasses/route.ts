import { NextRequest, NextResponse } from "next/server";
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

    const allGatePasss: any[] = [];
    const shardDbs = getAllShardDbs();

    if (studentId !== null) {
      const shardId = getShardId(studentId);
      const shardTable = `shard_${shardId}_gate_pass`;
      const rows = shardDbs[shardId].prepare(`SELECT * FROM ${shardTable}`).all() as any[];
      for (const row of rows) {
        if (row.student_id !== studentId) continue;
        if (statusFilter && row.status !== statusFilter) continue;
        allGatePasss.push(row);
      }
    } else {
      for (let i = 0; i < getNumShards(); i++) {
        const shardTable = `shard_${i}_gate_pass`;
        const rows = shardDbs[i].prepare(`SELECT * FROM ${shardTable}`).all() as any[];
        for (const row of rows) {
          if (statusFilter && row.status !== statusFilter) continue;
          allGatePasss.push(row);
        }
      }
    }

    return NextResponse.json(allGatePasss);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  try {
    const body = await request.json();
    const studentId = body.studentId;

    const shardId = getShardId(studentId);
    const shardDb = getShardDb(shardId);
    const shardTable = `shard_${shardId}_gate_pass`;

    const passId = getNextGlobalId("gate_pass");

    shardDb.prepare(
      `INSERT INTO ${shardTable} (pass_id, student_id, out_time, expected_in_time, actual_in_time, reason, status, approver_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(passId, body.studentId, body.outTime, body.expectedInTime, body.actualInTime || null, body.reason, body.status || "Pending", body.approverId || null);

    const newPass = {
      passId,
      studentId: body.studentId,
      outTime: body.outTime,
      expectedInTime: body.expectedInTime,
      actualInTime: body.actualInTime,
      reason: body.reason,
      status: body.status || "Pending",
      approverId: body.approverId,
    };

    logAction({
      tableName: "gate_pass",
      action: "INSERT",
      recordId: newPass.passId,
      performedBy: session.userId,
      details: { studentId: newPass.studentId, reason: newPass.reason },
    });

    return NextResponse.json(newPass, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
