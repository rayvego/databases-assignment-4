import { NextRequest, NextResponse } from "next/server";
import { db, member } from "@/lib/db";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  try {
    const members = await db.select().from(member);
    return NextResponse.json(members);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (isNextResponse(session)) return session;

  try {
    const body = await request.json();
    const result = await db.insert(member).values(body).returning();
    const newMember = result[0];

    logAction({
      tableName: "member",
      action: "INSERT",
      recordId: newMember.memberId,
      performedBy: session.userId,
      details: { name: newMember.name, email: newMember.email },
    });

    return NextResponse.json(newMember, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
