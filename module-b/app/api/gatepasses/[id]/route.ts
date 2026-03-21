import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getShardDb, getNumShards } from "@/lib/shard-router";

function findGatePassAcrossShards(passId: number): { row: any; shardId: number } | null {
  for (let i = 0; i < getNumShards(); i++) {
    const shardTable = `shard_${i}_gate_pass`;
    const row = getShardDb(i).prepare(
      `SELECT * FROM ${shardTable} WHERE pass_id = ?`,
    ).get(passId);
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
  const passId = Number(id);

  try {
    const found = findGatePassAcrossShards(passId);
    if (!found) {
      return NextResponse.json(
        { error: "Gate pass not found" },
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
  const passId = Number(id);

  try {
    const body = await request.json();

    // Race condition check for approve/reject.
    if (body.status === "Approved" || body.status === "Rejected") {
      const found = findGatePassAcrossShards(passId);
      if (!found) {
        return NextResponse.json(
          { error: "Gate pass not found" },
          { status: 404 },
        );
      }
      if (found.row.status !== "Pending") {
        return NextResponse.json(
          { error: "Gate pass has already been actioned" },
          { status: 409 },
        );
      }
    }

    // Find the shard again for the update.
    const found = findGatePassAcrossShards(passId);
    if (!found) {
      return NextResponse.json(
        { error: "Gate pass not found" },
        { status: 404 },
      );
    }

    const shardDb = getShardDb(found.shardId);
    const shardTable = `shard_${found.shardId}_gate_pass`;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (snakeKey === "pass_id") continue;
      setClauses.push(`${snakeKey} = ?`);
      values.push(value);
    }

    if (setClauses.length > 0) {
      values.push(passId);
      shardDb.prepare(
        `UPDATE ${shardTable} SET ${setClauses.join(", ")} WHERE pass_id = ?`,
      ).run(...values);
    }

    const updated = shardDb.prepare(
      `SELECT * FROM ${shardTable} WHERE pass_id = ?`,
    ).get(passId);

    if (!updated) {
      return NextResponse.json(
        { error: "Gate pass not found" },
        { status: 404 },
      );
    }

    logAction({
      tableName: "gate_pass",
      action: "UPDATE",
      recordId: passId,
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
  const passId = Number(id);

  try {
    const found = findGatePassAcrossShards(passId);
    if (!found) {
      return NextResponse.json(
        { error: "Gate pass not found" },
        { status: 404 },
      );
    }

    const shardDb = getShardDb(found.shardId);
    const shardTable = `shard_${found.shardId}_gate_pass`;

    shardDb.prepare(
      `DELETE FROM ${shardTable} WHERE pass_id = ?`,
    ).run(passId);

    logAction({
      tableName: "gate_pass",
      action: "DELETE",
      recordId: passId,
      performedBy: session.userId,
    });

    return NextResponse.json({ message: "Gate pass deleted" });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
