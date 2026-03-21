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
    const reportedByFilter = url.searchParams.get("reportedBy");
    const reportedBy = reportedByFilter ? Number(reportedByFilter) : null;
    const statusFilter = url.searchParams.get("status");
    const roomIdFilter = url.searchParams.get("roomId");

    const allRequests: any[] = [];
    const shardDbs = getAllShardDbs();

    if (reportedBy !== null) {
      const shardId = reportedBy % 3;
      const shardTable = `shard_${shardId}_maintenance_request`;
      const rows = shardDbs[shardId].prepare(`SELECT * FROM ${shardTable}`).all() as any[];
      for (const row of rows) {
        if (row.reported_by !== reportedBy) continue;
        if (statusFilter && row.status !== statusFilter) continue;
        if (roomIdFilter && row.room_id !== Number(roomIdFilter)) continue;
        allRequests.push(row);
      }
    } else {
      for (let i = 0; i < getNumShards(); i++) {
        const shardTable = `shard_${i}_maintenance_request`;
        const rows = shardDbs[i].prepare(`SELECT * FROM ${shardTable}`).all() as any[];
        for (const row of rows) {
          if (statusFilter && row.status !== statusFilter) continue;
          if (roomIdFilter && row.room_id !== Number(roomIdFilter)) continue;
          allRequests.push(row);
        }
      }
    }

    return NextResponse.json(allRequests);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  try {
    const body = await request.json();
    const reportedBy = body.reportedBy;

    // Shard by reported_by (member_id) since maintenance_request has no student_id.
    const shardId = reportedBy % 3;
    const shardDb = getShardDb(shardId);
    const shardTable = `shard_${shardId}_maintenance_request`;

    const requestId = getNextGlobalId("maintenance_request");

    shardDb.prepare(
      `INSERT INTO ${shardTable} (request_id, room_id, reported_by, title, description, priority, status, reported_date, resolved_date, resolved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(requestId, body.roomId || null, body.reportedBy, body.title, body.description, body.priority || "Medium", body.status || "Open", body.reportedDate || new Date().toISOString(), body.resolvedDate || null, body.resolvedBy || null);

    const newRequest = {
      requestId,
      roomId: body.roomId,
      reportedBy: body.reportedBy,
      title: body.title,
      description: body.description,
      priority: body.priority || "Medium",
      status: body.status || "Open",
      reportedDate: body.reportedDate,
      resolvedDate: body.resolvedDate,
      resolvedBy: body.resolvedBy,
    };

    logAction({
      tableName: "maintenance_request",
      action: "INSERT",
      recordId: newRequest.requestId,
      performedBy: session.userId,
      details: { title: newRequest.title, roomId: newRequest.roomId },
    });

    return NextResponse.json(newRequest, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
