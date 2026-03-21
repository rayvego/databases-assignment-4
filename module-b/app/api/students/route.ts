import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, member, sqlite } from "@/lib/db";
import { requireAuth, requireAdmin, isNextResponse } from "@/lib/middleware";
import { logAction } from "@/lib/audit";
import { getAllShardDbs, getShardDb, getShardId } from "@/lib/shard-router";

/**
 * Query the shard student table, then JOIN with member from main DB.
 * Returns null if student not found in shard.
 */
function getStudentWithMember(shardDb: any, shardTable: string, studentId: number): any | null {
  const studentRow = shardDb.prepare(
    `SELECT * FROM ${shardTable} WHERE student_id = ?`,
  ).get(studentId);

  if (!studentRow) return null;

  const memberRow = sqlite.prepare(
    `SELECT * FROM member WHERE member_id = ?`,
  ).get(studentRow.student_id);

  return { student: studentRow, member: memberRow };
}

export async function GET(request: NextRequest) {
  const session = await requireAuth(request);
  if (isNextResponse(session)) return session;

  try {
    const url = new URL(request.url);
    const courseFilter = url.searchParams.get("course") || null;

    const allStudents: any[] = [];
    for (let i = 0; i < 3; i++) {
      const shardDb = getShardDb(i);
      const shardTable = `shard_${i}_student`;
      const rows = shardDb.prepare(`SELECT * FROM ${shardTable}`).all() as any[];
      for (const row of rows) {
        if (courseFilter && row.course !== courseFilter) continue;
        const memberRow = sqlite.prepare(
          `SELECT * FROM member WHERE member_id = ?`,
        ).get(row.student_id);
        allStudents.push({ student: row, member: memberRow });
      }
    }
    return NextResponse.json(allStudents);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (isNextResponse(session)) return session;

  try {
    const body = await request.json();
    const {
      name,
      email,
      contactNumber,
      age,
      gender,
      address,
      profileImage,
      enrollmentNo,
      course,
      batchYear,
      guardianName,
      guardianContact,
    } = body;

    // STEP 1: Insert into member (main DB) to get the member_id.
    const memberResult = await db
      .insert(member)
      .values({
        name,
        email,
        contactNumber,
        age,
        gender,
        address,
        profileImage,
        userType: "Student",
      })
      .returning();

    const newMember = memberResult[0];

    logAction({
      tableName: "member",
      action: "INSERT",
      recordId: newMember.memberId,
      performedBy: session.userId,
      details: { name, email },
    });

    // STEP 2: Route to correct shard using the new student_id (= member_id).
    const shardId = getShardId(newMember.memberId);
    const shardDb = getShardDb(shardId);
    const shardTable = `shard_${shardId}_student`;

    try {
      shardDb.prepare(
        `INSERT INTO ${shardTable} (student_id, enrollment_no, course, batch_year, guardian_name, guardian_contact)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(newMember.memberId, enrollmentNo, course, batchYear, guardianName, guardianContact);
    } catch (shardError) {
      // Rollback: delete the member row we just inserted.
      await db.delete(member).where(eq(member.memberId, newMember.memberId));
      throw shardError;
    }

    const newStudent = {
      studentId: newMember.memberId,
      enrollmentNo,
      course,
      batchYear,
      guardianName,
      guardianContact,
    };

    logAction({
      tableName: "student",
      action: "INSERT",
      recordId: newStudent.studentId,
      performedBy: session.userId,
      details: { enrollmentNo, course },
    });

    return NextResponse.json(
      { member: newMember, student: newStudent },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
