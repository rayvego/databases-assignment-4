import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, room, hostelBlock } from "@/lib/db";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  try {
    const rooms = await db
      .select()
      .from(room)
      .innerJoin(hostelBlock, eq(room.blockId, hostelBlock.blockId));

    return NextResponse.json(rooms);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (isNextResponse(session)) return session;

  try {
    const body = await request.json();
    const result = await db.insert(room).values(body).returning();
    const newRoom = result[0];

    logAction({
      tableName: "room",
      action: "INSERT",
      recordId: newRoom.roomId,
      performedBy: session.userId,
      details: { roomNumber: newRoom.roomNumber, blockId: newRoom.blockId },
    });

    return NextResponse.json(newRoom, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
