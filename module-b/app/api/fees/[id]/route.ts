import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getShardDb, getNumShards } from "@/lib/shard-router";

function findFeePaymentAcrossShards(paymentId: number): { row: any; shardId: number } | null {
  for (let i = 0; i < getNumShards(); i++) {
    const shardTable = `shard_${i}_fee_payment`;
    const row = getShardDb(i).prepare(
      `SELECT * FROM ${shardTable} WHERE payment_id = ?`,
    ).get(paymentId);
    if (row) return { row, shardId: i };
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin(request);
  if (isNextResponse(session)) return session;

  const { id } = await params;
  const paymentId = Number(id);

  try {
    const found = findFeePaymentAcrossShards(paymentId);
    if (!found) {
      return NextResponse.json(
        { error: "Fee payment not found" },
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
  const paymentId = Number(id);

  try {
    const body = await request.json();
    const found = findFeePaymentAcrossShards(paymentId);

    if (!found) {
      return NextResponse.json(
        { error: "Fee payment not found" },
        { status: 404 },
      );
    }

    const shardDb = getShardDb(found.shardId);
    const shardTable = `shard_${found.shardId}_fee_payment`;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(body)) {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (snakeKey === "payment_id") continue;
      setClauses.push(`${snakeKey} = ?`);
      values.push(value);
    }

    if (setClauses.length > 0) {
      values.push(paymentId);
      shardDb.prepare(
        `UPDATE ${shardTable} SET ${setClauses.join(", ")} WHERE payment_id = ?`,
      ).run(...values);
    }

    const updated = shardDb.prepare(
      `SELECT * FROM ${shardTable} WHERE payment_id = ?`,
    ).get(paymentId);

    if (!updated) {
      return NextResponse.json(
        { error: "Fee payment not found" },
        { status: 404 },
      );
    }

    logAction({
      tableName: "fee_payment",
      action: "UPDATE",
      recordId: paymentId,
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
  const paymentId = Number(id);

  try {
    const found = findFeePaymentAcrossShards(paymentId);
    if (!found) {
      return NextResponse.json(
        { error: "Fee payment not found" },
        { status: 404 },
      );
    }

    const shardDb = getShardDb(found.shardId);
    const shardTable = `shard_${found.shardId}_fee_payment`;

    shardDb.prepare(
      `DELETE FROM ${shardTable} WHERE payment_id = ?`,
    ).run(paymentId);

    logAction({
      tableName: "fee_payment",
      action: "DELETE",
      recordId: paymentId,
      performedBy: session.userId,
    });

    return NextResponse.json({ message: "Fee payment deleted" });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
