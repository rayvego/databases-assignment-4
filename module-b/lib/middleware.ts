import { NextResponse } from "next/server";
import { getSessionFromRequest, JwtPayload } from "@/lib/auth";

export async function requireAuth(
  request: Request,
): Promise<JwtPayload | NextResponse> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return session;
}

export async function requireAdmin(
  request: Request,
): Promise<JwtPayload | NextResponse> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: admin access required" },
      { status: 403 },
    );
  }
  return session;
}

export function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
