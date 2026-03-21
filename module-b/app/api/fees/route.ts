import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getNextGlobalId } from "@/lib/global-id-sequence";
import { getShardDb, getShardId, getAllShardDbs, getNumShards } from "@/lib/shard-router";

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (isNextResponse(session)) return session;

  try {
    const url = new URL(request.url);
    const studentIdFilter = url.searchParams.get("studentId");
    const studentId = studentIdFilter ? Number(studentIdFilter) : null;
    const statusFilter = url.searchParams.get("status");
    const paymentTypeFilter = url.searchParams.get("paymentType");

    const allPayments: any[] = [];
    const shardDbs = getAllShardDbs();

    if (studentId !== null) {
      const shardId = getShardId(studentId);
      const shardTable = `shard_${shardId}_fee_payment`;
      const rows = shardDbs[shardId].prepare(`SELECT * FROM ${shardTable}`).all() as any[];
      for (const row of rows) {
        if (row.student_id !== studentId) continue;
        if (statusFilter && row.status !== statusFilter) continue;
        if (paymentTypeFilter && row.payment_type !== paymentTypeFilter) continue;
        allPayments.push(row);
      }
    } else {
      for (let i = 0; i < getNumShards(); i++) {
        const shardTable = `shard_${i}_fee_payment`;
        const rows = shardDbs[i].prepare(`SELECT * FROM ${shardTable}`).all() as any[];
        for (const row of rows) {
          if (statusFilter && row.status !== statusFilter) continue;
          if (paymentTypeFilter && row.payment_type !== paymentTypeFilter) continue;
          allPayments.push(row);
        }
      }
    }

    return NextResponse.json(allPayments);
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
    const shardTable = `shard_${shardId}_fee_payment`;

    const paymentId = getNextGlobalId("fee_payment");

    shardDb.prepare(
      `INSERT INTO ${shardTable} (payment_id, student_id, amount, payment_date, payment_type, transaction_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(paymentId, body.studentId, body.amount, body.paymentDate, body.paymentType, body.transactionId || null, body.status || "Pending");

    const newPayment = {
      paymentId,
      studentId: body.studentId,
      amount: body.amount,
      paymentDate: body.paymentDate,
      paymentType: body.paymentType,
      transactionId: body.transactionId,
      status: body.status || "Pending",
    };

    logAction({
      tableName: "fee_payment",
      action: "INSERT",
      recordId: newPayment.paymentId,
      performedBy: session.userId,
      details: {
        studentId: newPayment.studentId,
        amount: newPayment.amount,
        paymentType: newPayment.paymentType,
      },
    });

    return NextResponse.json(newPayment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
