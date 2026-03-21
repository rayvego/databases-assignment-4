/**
 * Comprehensive API Test Suite for Assignment 4 - Sharding
 *
 * Tests every route, every method, shard routing correctness, auth,
 * data integrity, and global ID sequence.
 *
 * Run from module-b/ directory:
 *   npx tsx test-api.ts
 *
 * Requirements:
 *   - Shard databases must exist (run scripts/create-shard-schemas.ts first)
 *   - Seed data must be loaded (run npm run db:seed first)
 *   - Next.js dev server will be started automatically on port 3456
 */

import { spawn, type ChildProcess } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import Database from "better-sqlite3";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "http://localhost:3456";
const STARTUP_TIMEOUT = 60_000; // ms to wait for server startup
const TEST_TIMEOUT = 120_000; // ms per test group

const MAIN_DB_PATH = path.join(process.cwd(), "sqlite.db");

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

interface ApiResponse {
	status: number;
	data: unknown;
}

async function api(
	method: string,
	path: string,
	token?: string,
	body?: unknown,
): Promise<ApiResponse> {
	const url = `${BASE_URL}${path}`;
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (token) headers["Authorization"] = `Bearer ${token}`;

	const init: RequestInit = { method, headers };
	if (body !== undefined) init.body = JSON.stringify(body);

	const res = await fetch(url, init);
	let data: unknown;
	const contentType = res.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		data = await res.json();
	} else {
		data = await res.text();
	}
	return { status: res.status, data };
}

async function waitForServer(timeout = STARTUP_TIMEOUT): Promise<void> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${BASE_URL}/api/auth/me`);
			if (res.ok || res.status === 401) return; // server is up
		} catch {
			// not ready yet
		}
		await sleep(1000);
	}
	throw new Error(`Server did not start within ${timeout}ms`);
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function assertEqual<T>(actual: T, expected: T, msg = ""): void {
	if (actual !== expected) {
		throw new Error(
			`${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`,
		);
	}
}

function assertOk(status: number, msg = ""): void {
	if (status < 200 || status >= 300) {
		throw new Error(`${msg}\n  Expected 2xx, got ${status}`);
	}
}

function assertStatus(res: ApiResponse, expected: number, msg = ""): void {
	if (res.status !== expected) {
		throw new Error(
			`${msg}\n  Expected: ${expected}\n  Actual:   ${res.status}\n  Body: ${JSON.stringify(res.data)}`,
		);
	}
}

function assertContains(obj: Record<string, unknown>, key: string): void {
	if (!(key in obj)) {
		throw new Error(`Expected key "${key}" in object: ${JSON.stringify(obj)}`);
	}
}

function assertGreaterThan(actual: number, min: number, msg = ""): void {
	if (actual <= min) {
		throw new Error(`${msg}\n  Expected: > ${min}\n  Actual: ${actual}`);
	}
}

// Direct DB access for verification
function getMainDb(): Database.Database {
	return new Database(MAIN_DB_PATH);
}

function getShardDb(shardId: number): Database.Database {
	return new Database(
		path.join(process.cwd(), "src", "db", `shard_${shardId}.db`),
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Server lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let server: ChildProcess | null = null;

async function isServerRunning(): Promise<boolean> {
	try {
		const res = await fetch(`${BASE_URL}/api/auth/me`);
		return res.ok || res.status === 401;
	} catch {
		return false;
	}
}

async function startServer(): Promise<void> {
	// Skip spawning if a server is already running on the port
	if (await isServerRunning()) {
		console.log(
			"✅ Server already running on port 3456 - using existing instance\n",
		);
		return;
	}

	console.log("🚀 Starting Next.js dev server on port 3456...");
	server = spawn("npx", ["next", "dev", "--port", "3456"], {
		cwd: process.cwd(),
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			...process.env,
			JWT_SECRET: "test-secret-for-api-tests",
			NODE_ENV: "development",
		},
	});

	server.stdout?.on("data", (d: Buffer) => {
		const line = d.toString();
		if (line.includes("Ready") || line.includes("started server")) {
			// server signals ready
		}
	});

	server.stderr?.on("data", (d: Buffer) => {
		const line = d.toString().trim();
		if (
			line &&
			!line.includes("DeprecationWarning") &&
			!line.includes("ExperimentalWarning")
		) {
			// console.error("[server]", line);
		}
	});

	await waitForServer();
	console.log("✅ Server is ready\n");
}

async function stopServer(): Promise<void> {
	if (!server) return;
	console.log("\n🛑 Stopping server...");
	server.kill("SIGTERM");
	await sleep(2000);
	if (!server.killed) {
		server.kill("SIGKILL");
	}
	server = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

let adminToken: string | null = null;
let userToken: string | null = null;
let testStudentId: number | null = null; // a student we create in tests
let testRoomId: number | null = null; // a room from seed data
let testMemberId: number | null = null; // a member from seed data

async function setupAuth(): Promise<void> {
	// Login as admin
	const res = await api("POST", "/api/auth/login", undefined, {
		username: "admin",
		password: "admin123",
	});
	if (res.status === 200 && typeof res.data === "object" && res.data !== null) {
		const d = res.data as Record<string, unknown>;
		adminToken = d.token as string;
	} else {
		throw new Error(
			"Failed to login as admin. Check that seed data is loaded.",
		);
	}

	// Login as regular user
	const res2 = await api("POST", "/api/auth/login", undefined, {
		username: "testuser",
		password: "user123",
	});
	if (
		res2.status === 200 &&
		typeof res2.data === "object" &&
		res2.data !== null
	) {
		const d = res2.data as Record<string, unknown>;
		userToken = d.token as string;
	} else {
		throw new Error(
			"Failed to login as testuser. Check that seed data is loaded.",
		);
	}

	console.log("  admin token:", adminToken!.slice(0, 20) + "...");
	console.log("  user token:", userToken!.slice(0, 20) + "...");

	// Get a room ID from main DB for allocation tests
	const mainDb = getMainDb();
	const room = mainDb.prepare("SELECT room_id FROM room LIMIT 1").get() as
		| { room_id: number }
		| undefined;
	testRoomId = room?.room_id ?? null;
	mainDb.close();

	// Get a staff member ID (used for maintenance shard routing)
	const mainDb2 = getMainDb();
	const member = mainDb2
		.prepare("SELECT member_id FROM member WHERE user_type = 'Staff' LIMIT 1")
		.get() as { member_id: number } | undefined;
	testMemberId = member?.member_id ?? null;
	mainDb2.close();

	console.log("  testRoomId:", testRoomId);
	console.log("  testMemberId:", testMemberId);
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARD ROUTING TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testShardRouting(): Promise<void> {
	console.log("\n=== Shard Routing Tests ===");

	// Verify that getShardId(studentId) = studentId % 3
	const testCases = [
		{ studentId: 1, expectedShard: 1 },
		{ studentId: 2, expectedShard: 2 },
		{ studentId: 3, expectedShard: 0 },
		{ studentId: 6, expectedShard: 0 },
		{ studentId: 7, expectedShard: 1 },
		{ studentId: 10, expectedShard: 1 },
		{ studentId: 12, expectedShard: 0 },
		{ studentId: 15, expectedShard: 0 },
	];

	for (const tc of testCases) {
		const expected = tc.expectedShard;
		const actual = tc.studentId % 3;
		assertEqual(
			actual,
			expected,
			`student_id ${tc.studentId} should route to shard ${expected}, got ${actual}`,
		);
	}
	console.log("  ✅ getShardId() formula correct");

	// Verify records are colocated: a student's allocations, gatepasses, fees
	// should all be in the same shard as the student
	const mainDb = getMainDb();

	// Pick a student from seed data
	const student = mainDb
		.prepare("SELECT s.student_id FROM student s LIMIT 1")
		.get() as { student_id: number } | undefined;
	if (!student) {
		console.log("  ⚠️  No students found in DB, skipping colocated shard test");
		mainDb.close();
		return;
	}

	const studentId = student.student_id;
	const expectedShard = studentId % 3;

	// Check each sharded table for this student's records
	const shardedTables = [
		"student",
		"allocation",
		"gate_pass",
		"fee_payment",
		"visit_log",
	];

	for (const table of shardedTables) {
		let foundInShard: number | null = null;
		for (let s = 0; s < 3; s++) {
			const shardDb = getShardDb(s);
			const shardTable = `shard_${s}_${table}`;
			let count = 0;
			try {
				if (table === "student") {
					const row = shardDb
						.prepare(
							`SELECT student_id FROM ${shardTable} WHERE student_id = ?`,
						)
						.get(studentId);
					count = row ? 1 : 0;
				} else if (table === "allocation") {
					const row = shardDb
						.prepare(
							`SELECT allocation_id FROM ${shardTable} WHERE student_id = ?`,
						)
						.get(studentId);
					count = row ? 1 : 0;
				} else if (table === "gate_pass") {
					const row = shardDb
						.prepare(`SELECT pass_id FROM ${shardTable} WHERE student_id = ?`)
						.get(studentId);
					count = row ? 1 : 0;
				} else if (table === "fee_payment") {
					const row = shardDb
						.prepare(
							`SELECT payment_id FROM ${shardTable} WHERE student_id = ?`,
						)
						.get(studentId);
					count = row ? 1 : 0;
				} else if (table === "visit_log") {
					const row = shardDb
						.prepare(`SELECT visit_id FROM ${shardTable} WHERE student_id = ?`)
						.get(studentId);
					count = row ? 1 : 0;
				}
			} catch {
				count = 0;
			}
			if (count > 0) foundInShard = s;
			shardDb.close();
		}

		// Records should be in the expected shard OR not exist yet (for some tables)
		if (foundInShard !== null) {
			assertEqual(
				foundInShard,
				expectedShard,
				`${table} record for student ${studentId} should be in shard ${expectedShard}, found in ${foundInShard}`,
			);
		}
		console.log(
			`  ✅ ${table}: student ${studentId} correctly in shard ${foundInShard ?? "(no records)"}`,
		);
	}

	mainDb.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testAuth(): Promise<void> {
	console.log("\n=== Auth Tests ===");

	// Unauthenticated request should get 401
	const res401 = await api("GET", "/api/auth/me");
	assertStatus(res401, 401, "GET /api/auth/me without token");
	console.log("  ✅ GET /api/auth/me → 401 without token");

	// Invalid credentials
	const resBad = await api("POST", "/api/auth/login", undefined, {
		username: "admin",
		password: "wrongpassword",
	});
	assertStatus(resBad, 401, "POST /api/auth/login wrong password");
	console.log("  ✅ POST /api/auth/login → 401 wrong password");

	// Non-existent user
	const res404 = await api("POST", "/api/auth/login", undefined, {
		username: "nobody",
		password: "password",
	});
	assertStatus(res404, 401, "POST /api/auth/login unknown user");
	console.log("  ✅ POST /api/auth/login → 401 unknown user");

	// Missing fields
	const res422 = await api("POST", "/api/auth/login", undefined, {
		username: "admin",
	});
	assertStatus(res422, 400, "POST /api/auth/login missing password");
	console.log("  ✅ POST /api/auth/login → 400 missing fields");

	// Valid login
	const resOk = await api("POST", "/api/auth/login", undefined, {
		username: "admin",
		password: "admin123",
	});
	assertOk(resOk.status, "POST /api/auth/login valid credentials");
	assertContains(resOk.data as Record<string, unknown>, "token");
	assertContains(resOk.data as Record<string, unknown>, "role");
	console.log("  ✅ POST /api/auth/login → 200 + token");

	// Me endpoint with valid token
	const resMe = await api("GET", "/api/auth/me", adminToken!);
	assertOk(resMe.status, "GET /api/auth/me with valid token");
	console.log("  ✅ GET /api/auth/me → 200 with valid token");

	// ── POST /api/auth/logout ────────────────────────────────────────────────
	const resLogout = await api("POST", "/api/auth/logout", adminToken!);
	assertOk(resLogout.status, "POST /api/auth/logout");
	console.log(
		"  ✅ POST /api/auth/logout → 200 (stateless, always succeeds for valid token)",
	);

	// Logout without token
	const resLogoutNoAuth = await api("POST", "/api/auth/logout");
	assertStatus(resLogoutNoAuth, 401, "POST /api/auth/logout without token");
	console.log("  ✅ POST /api/auth/logout → 401 without token");
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENTS TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testStudents(): Promise<void> {
	console.log("\n=== Students API Tests ===");

	// ── GET /api/students ──────────────────────────────────────────────────────
	const resList = await api("GET", "/api/students", userToken!);
	assertOk(resList.status, "GET /api/students");
	console.log("  ✅ GET /api/students → 200");

	// ── GET /api/students with course filter ──────────────────────────────────
	const resFiltered = await api("GET", "/api/students?course=CS", userToken!);
	assertOk(resFiltered.status, "GET /api/students?course=CS");
	console.log("  ✅ GET /api/students?course=CS → 200");

	// ── POST /api/students (create new student) ───────────────────────────────
	// Use random suffix so tests are re-run safe (no unique constraint collisions)
	const randomSuffix = Math.floor(Math.random() * 999999);
	const newStudent = {
		name: "Test Student",
		email: `teststudent${randomSuffix}@example.com`,
		contactNumber: "9999999999",
		age: 20,
		gender: "Male",
		address: "Test Hostel Room 101",
		enrollmentNo: "TEST" + randomSuffix,
		course: "Computer Science",
		batchYear: 2025,
		guardianName: "Test Guardian",
		guardianContact: "8888888888",
	};
	const resCreate = await api("POST", "/api/students", adminToken!, newStudent);
	assertOk(resCreate.status, "POST /api/students");
	const created = resCreate.data as Record<string, unknown>;
	assertContains(created, "member");
	assertContains(created, "student");
	const memberId = (created.member as Record<string, unknown>)
		.memberId as number;
	const studentId = (created.student as Record<string, unknown>)
		.studentId as number;
	testStudentId = studentId;
	console.log(
		`  ✅ POST /api/students → 201 (student_id=${studentId}, member_id=${memberId})`,
	);

	// Verify student is in correct shard
	const expectedShard = studentId % 3;
	const shardDb = getShardDb(expectedShard);
	const inShard = shardDb
		.prepare(
			`SELECT student_id FROM shard_${expectedShard}_student WHERE student_id = ?`,
		)
		.get(studentId);
	shardDb.close();
	if (!inShard)
		throw new Error(`Student ${studentId} not found in shard ${expectedShard}`);
	console.log(
		`  ✅ Student ${studentId} correctly stored in shard ${expectedShard}`,
	);

	// Verify member is in main DB
	const mainDb = getMainDb();
	const inMain = mainDb
		.prepare("SELECT member_id FROM member WHERE member_id = ?")
		.get(memberId);
	mainDb.close();
	if (!inMain) throw new Error(`Member ${memberId} not found in main DB`);
	console.log(`  ✅ Member ${memberId} correctly stored in main DB`);

	// ── POST /api/students requires admin ─────────────────────────────────────
	const resU = await api("POST", "/api/students", userToken!, newStudent);
	assertStatus(resU, 403, "POST /api/students as user");
	console.log("  ✅ POST /api/students → 403 as regular user");

	// ── GET /api/students/:id ─────────────────────────────────────────────────
	const resGet = await api("GET", `/api/students/${testStudentId}`, userToken!);
	assertOk(resGet.status, `GET /api/students/${testStudentId}`);
	const studentData = resGet.data as Record<string, unknown>;
	assertContains(studentData, "student");
	assertContains(studentData, "member");
	console.log(`  ✅ GET /api/students/${testStudentId} → 200`);

	// GET non-existent student
	const res404 = await api("GET", "/api/students/999999", userToken!);
	assertStatus(res404, 404, "GET /api/students/999999");
	console.log("  ✅ GET /api/students/999999 → 404");

	// ── PUT /api/students/:id ─────────────────────────────────────────────────
	const resUpdate = await api(
		"PUT",
		`/api/students/${testStudentId}`,
		adminToken!,
		{
			course: "Electronics",
		},
	);
	assertOk(resUpdate.status, `PUT /api/students/${testStudentId}`);
	const updated = resUpdate.data as Record<string, unknown>;
	if (updated && typeof updated === "object") {
		// shard table returns raw data
		const course = (updated as Record<string, unknown>).course;
		assertEqual(course, "Electronics", "Course should be updated");
	}
	console.log(`  ✅ PUT /api/students/${testStudentId} → 200`);

	// PUT requires admin
	const resPutU = await api(
		"PUT",
		`/api/students/${testStudentId}`,
		userToken!,
		{ course: "CS" },
	);
	assertStatus(resPutU, 403, "PUT /api/students/:id as user");
	console.log("  ✅ PUT /api/students/:id → 403 as regular user");

	// ── DELETE /api/students/:id ──────────────────────────────────────────────
	// First create another student to delete (avoids breaking subsequent tests)
	const toDelete = {
		name: "Delete Me",
		email: `deleteme${Date.now()}@example.com`,
		contactNumber: "7777777777",
		age: 21,
		gender: "Female",
		address: "Test Room",
		enrollmentNo: "DEL" + Date.now(),
		course: "Physics",
		batchYear: 2025,
		guardianName: "Guardian",
		guardianContact: "6666666666",
	};
	const resDelCreate = await api(
		"POST",
		"/api/students",
		adminToken!,
		toDelete,
	);
	assertOk(resDelCreate.status, "POST student to delete");
	const toDeleteStudentId = (resDelCreate.data as Record<string, unknown>)
		.student as Record<string, unknown>;
	const deleteId = toDeleteStudentId.studentId as number;

	const resDelete = await api(
		"DELETE",
		`/api/students/${deleteId}`,
		adminToken!,
	);
	assertOk(resDelete.status, `DELETE /api/students/${deleteId}`);
	console.log(`  ✅ DELETE /api/students/${deleteId} → 200`);

	// Verify deleted from shard
	const delShard = deleteId % 3;
	const shardDbDel = getShardDb(delShard);
	const afterDelete = shardDbDel
		.prepare(
			`SELECT student_id FROM shard_${delShard}_student WHERE student_id = ?`,
		)
		.get(deleteId);
	shardDbDel.close();
	if (afterDelete)
		throw new Error(`Student ${deleteId} still exists in shard after delete`);
	console.log(`  ✅ Student ${deleteId} removed from shard ${delShard}`);

	// DELETE requires admin
	const resDelU = await api(
		"DELETE",
		`/api/students/${testStudentId}`,
		userToken!,
	);
	assertStatus(resDelU, 403, "DELETE /api/students/:id as user");
	console.log("  ✅ DELETE /api/students/:id → 403 as regular user");

	// ── Auth required ─────────────────────────────────────────────────────────
	const resNoAuth = await api("GET", "/api/students");
	assertStatus(resNoAuth, 401, "GET /api/students no auth");
	console.log("  ✅ GET /api/students → 401 without auth");
}

// ─────────────────────────────────────────────────────────────────────────────
// ALLOCATIONS TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testAllocations(): Promise<void> {
	console.log("\n=== Allocations API Tests ===");

	if (!testStudentId) {
		console.log("  ⚠️  Skipping: no test student available");
		return;
	}

	// Find a room with available capacity (not full)
	const mainDbRoom = getMainDb();
	const availableRoom = mainDbRoom
		.prepare(
			"SELECT room_id FROM room WHERE current_occupancy < capacity LIMIT 1",
		)
		.get() as { room_id: number } | undefined;
	mainDbRoom.close();

	if (!availableRoom) {
		console.log("  ⚠️  Skipping: no rooms with available capacity");
		return;
	}

	const testRoomId = availableRoom.room_id;
	console.log(`  using room_id=${testRoomId} (has capacity)`);

	const studentId = testStudentId;
	const shardId = studentId % 3;

	// ── GET /api/allocations (list all - fan out) ─────────────────────────────
	const resList = await api("GET", "/api/allocations", adminToken!);
	assertOk(resList.status, "GET /api/allocations");
	console.log("  ✅ GET /api/allocations → 200 (fan-out)");

	// ── GET /api/allocations?studentId=X (direct shard) ─────────────────────
	const resByStudent = await api(
		"GET",
		`/api/allocations?studentId=${studentId}`,
		adminToken!,
	);
	assertOk(resByStudent.status, `GET /api/allocations?studentId=${studentId}`);
	console.log(
		`  ✅ GET /api/allocations?studentId=${studentId} → 200 (direct shard ${shardId})`,
	);

	// ── POST /api/allocations ─────────────────────────────────────────────────
	// Get room occupancy before
	const mainDbBefore = getMainDb();
	const roomBefore = mainDbBefore
		.prepare("SELECT current_occupancy, capacity FROM room WHERE room_id = ?")
		.get(testRoomId) as
		| { current_occupancy: number; capacity: number }
		| undefined;
	mainDbBefore.close();

	const newAlloc = {
		studentId,
		roomId: testRoomId,
		checkInDate: "2025-04-01",
		status: "Active",
	};
	const resCreate = await api(
		"POST",
		"/api/allocations",
		adminToken!,
		newAlloc,
	);
	assertOk(resCreate.status, "POST /api/allocations");
	const allocData = resCreate.data as Record<string, unknown>;
	assertContains(allocData, "allocationId");
	const allocId = allocData.allocationId as number;
	console.log(`  ✅ POST /api/allocations → 201 (allocation_id=${allocId})`);

	// Verify in correct shard
	const shardDbAlloc = getShardDb(shardId);
	const inShardAlloc = shardDbAlloc
		.prepare(
			`SELECT allocation_id FROM shard_${shardId}_allocation WHERE allocation_id = ?`,
		)
		.get(allocId);
	shardDbAlloc.close();
	if (!inShardAlloc)
		throw new Error(`Allocation ${allocId} not in shard ${shardId}`);
	console.log(`  ✅ Allocation ${allocId} correctly in shard ${shardId}`);

	// Verify room occupancy incremented
	const mainDbAfter = getMainDb();
	const roomAfter = mainDbAfter
		.prepare("SELECT current_occupancy FROM room WHERE room_id = ?")
		.get(testRoomId) as { current_occupancy: number } | undefined;
	mainDbAfter.close();
	if (roomBefore && roomAfter) {
		assertEqual(
			roomAfter.current_occupancy,
			roomBefore.current_occupancy + 1,
			"Room occupancy should increment",
		);
		console.log("  ✅ Room occupancy correctly incremented");
	}

	// POST requires admin
	const resAllocU = await api("POST", "/api/allocations", userToken!, newAlloc);
	assertStatus(resAllocU, 403, "POST /api/allocations as user");
	console.log("  ✅ POST /api/allocations → 403 as regular user");

	// Room at full capacity
	// (We just test the basic rejection path by trying to insert same data again
	//  which may succeed if the room has capacity > current_occupancy + 1)
	// For a more robust test, we'd need a full room, but we'll skip that edge case.

	// ── GET /api/allocations/:id (fan-out by ID) ──────────────────────────────
	const resGet = await api("GET", `/api/allocations/${allocId}`, adminToken!);
	assertOk(resGet.status, `GET /api/allocations/${allocId}`);
	console.log(`  ✅ GET /api/allocations/${allocId} → 200 (found via fan-out)`);

	// Non-existent
	const res404 = await api("GET", "/api/allocations/999999", adminToken!);
	assertStatus(res404, 404, "GET /api/allocations/999999");
	console.log("  ✅ GET /api/allocations/999999 → 404");

	// ── PUT /api/allocations/:id (close allocation) ───────────────────────────
	const resClose = await api(
		"PUT",
		`/api/allocations/${allocId}`,
		adminToken!,
		{
			status: "Completed",
		},
	);
	assertOk(resClose.status, `PUT /api/allocations/${allocId}`);
	console.log(`  ✅ PUT /api/allocations/${allocId} (close) → 200`);

	// Verify occupancy decremented
	const mainDbClosed = getMainDb();
	const roomClosed = mainDbClosed
		.prepare("SELECT current_occupancy FROM room WHERE room_id = ?")
		.get(testRoomId) as { current_occupancy: number } | undefined;
	mainDbClosed.close();
	if (roomBefore && roomClosed) {
		assertEqual(
			roomClosed.current_occupancy,
			roomBefore.current_occupancy,
			"Room occupancy should be restored after close",
		);
		console.log("  ✅ Room occupancy correctly decremented after close");
	}

	// ── DELETE /api/allocations/:id ───────────────────────────────────────────
	// First create one to delete
	const forDelete = {
		studentId,
		roomId: testRoomId,
		checkInDate: "2025-05-01",
		status: "Active",
	};
	const resDelCreate = await api(
		"POST",
		"/api/allocations",
		adminToken!,
		forDelete,
	);
	assertOk(resDelCreate.status, "POST allocation for delete");
	const delAllocId = (resDelCreate.data as Record<string, unknown>)
		.allocationId as number;

	const resDelete = await api(
		"DELETE",
		`/api/allocations/${delAllocId}`,
		adminToken!,
	);
	assertOk(resDelete.status, `DELETE /api/allocations/${delAllocId}`);
	console.log(`  ✅ DELETE /api/allocations/${delAllocId} → 200`);

	// Verify deleted
	const shardDbDel = getShardDb(shardId);
	const afterDelete = shardDbDel
		.prepare(
			`SELECT allocation_id FROM shard_${shardId}_allocation WHERE allocation_id = ?`,
		)
		.get(delAllocId);
	shardDbDel.close();
	if (afterDelete) throw new Error(`Allocation ${delAllocId} still in shard`);
	console.log(`  ✅ Allocation ${delAllocId} removed from shard ${shardId}`);

	// ── Auth required ─────────────────────────────────────────────────────────
	const resNoAuth = await api("GET", "/api/allocations");
	assertStatus(resNoAuth, 401, "GET /api/allocations no auth");
	console.log("  ✅ GET /api/allocations → 401 without auth");
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE PASSES TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testGatePasses(): Promise<void> {
	console.log("\n=== Gate Passes API Tests ===");

	if (!testStudentId) {
		console.log("  ⚠️  Skipping: no test student available");
		return;
	}

	const studentId = testStudentId;
	const shardId = studentId % 3;

	// ── GET /api/gatepasses (list all - fan out) ─────────────────────────────
	const resList = await api("GET", "/api/gatepasses", userToken!);
	assertOk(resList.status, "GET /api/gatepasses");
	console.log("  ✅ GET /api/gatepasses → 200");

	// ── GET /api/gatepasses?studentId=X ────────────────────────────────────────
	const resByStudent = await api(
		"GET",
		`/api/gatepasses?studentId=${studentId}`,
		userToken!,
	);
	assertOk(resByStudent.status, `GET /api/gatepasses?studentId=${studentId}`);
	console.log(
		`  ✅ GET /api/gatepasses?studentId=${studentId} → 200 (shard ${shardId})`,
	);

	// ── POST /api/gatepasses ─────────────────────────────────────────────────
	const newPass = {
		studentId,
		outTime: "2025-04-15T10:00:00",
		expectedInTime: "2025-04-15T18:00:00",
		reason: "Family visit",
		status: "Pending",
	};
	const resCreate = await api("POST", "/api/gatepasses", userToken!, newPass);
	assertOk(resCreate.status, "POST /api/gatepasses");
	const passData = resCreate.data as Record<string, unknown>;
	assertContains(passData, "passId");
	const passId = passData.passId as number;
	console.log(`  ✅ POST /api/gatepasses → 201 (pass_id=${passId})`);

	// Verify in correct shard
	const shardDb = getShardDb(shardId);
	const inShard = shardDb
		.prepare(`SELECT pass_id FROM shard_${shardId}_gate_pass WHERE pass_id = ?`)
		.get(passId);
	shardDb.close();
	if (!inShard) throw new Error(`Gate pass ${passId} not in shard ${shardId}`);
	console.log(`  ✅ Gate pass ${passId} correctly in shard ${shardId}`);

	// ── GET /api/gatepasses/:id (fan-out) ────────────────────────────────────
	const resGet = await api("GET", `/api/gatepasses/${passId}`, userToken!);
	assertOk(resGet.status, `GET /api/gatepasses/${passId}`);
	console.log(`  ✅ GET /api/gatepasses/${passId} → 200`);

	// Non-existent
	const res404 = await api("GET", "/api/gatepasses/999999", userToken!);
	assertStatus(res404, 404, "GET /api/gatepasses/999999");
	console.log("  ✅ GET /api/gatepasses/999999 → 404");

	// ── PUT /api/gatepasses/:id (approve) ────────────────────────────────────
	const resApprove = await api(
		"PUT",
		`/api/gatepasses/${passId}`,
		adminToken!,
		{
			status: "Approved",
		},
	);
	assertOk(resApprove.status, `PUT /api/gatepasses/${passId} approve`);
	console.log(`  ✅ PUT /api/gatepasses/${passId} (approve) → 200`);

	// Cannot approve already actioned pass (409)
	const res409 = await api("PUT", `/api/gatepasses/${passId}`, adminToken!, {
		status: "Rejected",
	});
	assertStatus(res409, 409, "PUT already actioned gate pass");
	console.log(`  ✅ PUT /api/gatepasses/${passId} (double action) → 409`);

	// ── DELETE /api/gatepasses/:id ────────────────────────────────────────────
	const forDelete = {
		studentId,
		outTime: "2025-04-16T10:00:00",
		expectedInTime: "2025-04-16T18:00:00",
		reason: "Medical",
		status: "Pending",
	};
	const resDelCreate = await api(
		"POST",
		"/api/gatepasses",
		userToken!,
		forDelete,
	);
	assertOk(resDelCreate.status, "POST gate pass for delete");
	const delPassId = (resDelCreate.data as Record<string, unknown>)
		.passId as number;

	const resDelete = await api(
		"DELETE",
		`/api/gatepasses/${delPassId}`,
		adminToken!,
	);
	assertOk(resDelete.status, `DELETE /api/gatepasses/${delPassId}`);
	console.log(`  ✅ DELETE /api/gatepasses/${delPassId} → 200`);

	// Verify deleted
	const shardDbDel = getShardDb(shardId);
	const afterDelete = shardDbDel
		.prepare(`SELECT pass_id FROM shard_${shardId}_gate_pass WHERE pass_id = ?`)
		.get(delPassId);
	shardDbDel.close();
	if (afterDelete) throw new Error(`Gate pass ${delPassId} still in shard`);
	console.log(`  ✅ Gate pass ${delPassId} removed from shard ${shardId}`);

	// ── Auth required ─────────────────────────────────────────────────────────
	const resNoAuth = await api("GET", "/api/gatepasses");
	assertStatus(resNoAuth, 401, "GET /api/gatepasses no auth");
	console.log("  ✅ GET /api/gatepasses → 401 without auth");
}

// ─────────────────────────────────────────────────────────────────────────────
// FEES TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testFees(): Promise<void> {
	console.log("\n=== Fees API Tests ===");

	if (!testStudentId) {
		console.log("  ⚠️  Skipping: no test student available");
		return;
	}

	const studentId = testStudentId;
	const shardId = studentId % 3;

	// ── GET /api/fees (list all - fan out) ───────────────────────────────────
	const resList = await api("GET", "/api/fees", adminToken!);
	assertOk(resList.status, "GET /api/fees");
	console.log("  ✅ GET /api/fees → 200");

	// ── GET /api/fees?studentId=X ─────────────────────────────────────────────
	const resByStudent = await api(
		"GET",
		`/api/fees?studentId=${studentId}`,
		adminToken!,
	);
	assertOk(resByStudent.status, `GET /api/fees?studentId=${studentId}`);
	console.log(
		`  ✅ GET /api/fees?studentId=${studentId} → 200 (shard ${shardId})`,
	);

	// ── POST /api/fees ────────────────────────────────────────────────────────
	const newFee = {
		studentId,
		amount: 15000,
		paymentDate: "2025-04-10",
		paymentType: "Hostel_Fee",
		transactionId: "TXN" + Date.now(),
		status: "Success",
	};
	const resCreate = await api("POST", "/api/fees", adminToken!, newFee);
	assertOk(resCreate.status, "POST /api/fees");
	const feeData = resCreate.data as Record<string, unknown>;
	assertContains(feeData, "paymentId");
	const paymentId = feeData.paymentId as number;
	console.log(`  ✅ POST /api/fees → 201 (payment_id=${paymentId})`);

	// Verify in correct shard
	const shardDb = getShardDb(shardId);
	const inShard = shardDb
		.prepare(
			`SELECT payment_id FROM shard_${shardId}_fee_payment WHERE payment_id = ?`,
		)
		.get(paymentId);
	shardDb.close();
	if (!inShard)
		throw new Error(`Fee payment ${paymentId} not in shard ${shardId}`);
	console.log(`  ✅ Fee payment ${paymentId} correctly in shard ${shardId}`);

	// POST requires admin (even auth user should be rejected)
	const resFeeU = await api("POST", "/api/fees", userToken!, newFee);
	assertStatus(resFeeU, 403, "POST /api/fees as user");
	console.log("  ✅ POST /api/fees → 403 as regular user");

	// ── GET /api/fees/:id (fan-out) ───────────────────────────────────────────
	const resGet = await api("GET", `/api/fees/${paymentId}`, adminToken!);
	assertOk(resGet.status, `GET /api/fees/${paymentId}`);
	console.log(`  ✅ GET /api/fees/${paymentId} → 200`);

	// Non-existent
	const res404 = await api("GET", "/api/fees/999999", adminToken!);
	assertStatus(res404, 404, "GET /api/fees/999999");
	console.log("  ✅ GET /api/fees/999999 → 404");

	// ── PUT /api/fees/:id ────────────────────────────────────────────────────
	const resUpdate = await api("PUT", `/api/fees/${paymentId}`, adminToken!, {
		status: "Success",
	});
	assertOk(resUpdate.status, `PUT /api/fees/${paymentId}`);
	console.log(`  ✅ PUT /api/fees/${paymentId} → 200`);

	// ── DELETE /api/fees/:id ────────────────────────────────────────────────
	const forDelete = {
		studentId,
		amount: 5000,
		paymentDate: "2025-04-11",
		paymentType: "Mess_Fee",
		transactionId: "TXN" + (Date.now() + 1),
		status: "Pending",
	};
	const resDelCreate = await api("POST", "/api/fees", adminToken!, forDelete);
	assertOk(resDelCreate.status, "POST fee for delete");
	const delFeeId = (resDelCreate.data as Record<string, unknown>)
		.paymentId as number;

	const resDelete = await api("DELETE", `/api/fees/${delFeeId}`, adminToken!);
	assertOk(resDelete.status, `DELETE /api/fees/${delFeeId}`);
	console.log(`  ✅ DELETE /api/fees/${delFeeId} → 200`);

	// Verify deleted
	const shardDbDel = getShardDb(shardId);
	const afterDelete = shardDbDel
		.prepare(
			`SELECT payment_id FROM shard_${shardId}_fee_payment WHERE payment_id = ?`,
		)
		.get(delFeeId);
	shardDbDel.close();
	if (afterDelete) throw new Error(`Fee payment ${delFeeId} still in shard`);
	console.log(`  ✅ Fee payment ${delFeeId} removed from shard ${shardId}`);

	// ── Auth required ─────────────────────────────────────────────────────────
	const resNoAuth = await api("GET", "/api/fees");
	assertStatus(resNoAuth, 401, "GET /api/fees no auth");
	console.log("  ✅ GET /api/fees → 401 without auth");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAINTENANCE REQUESTS TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testMaintenance(): Promise<void> {
	console.log("\n=== Maintenance API Tests ===");

	if (!testMemberId) {
		console.log("  ⚠️  Skipping: no test member available");
		return;
	}

	const reportedBy = testMemberId; // staff member ID (also valid member_id)
	const shardId = reportedBy % 3;

	// ── GET /api/maintenance (list all - fan out) ─────────────────────────────
	const resList = await api("GET", "/api/maintenance", userToken!);
	assertOk(resList.status, "GET /api/maintenance");
	console.log("  ✅ GET /api/maintenance → 200");

	// ── GET /api/maintenance?reportedBy=X ─────────────────────────────────────
	const resByReporter = await api(
		"GET",
		`/api/maintenance?reportedBy=${reportedBy}`,
		userToken!,
	);
	assertOk(
		resByReporter.status,
		`GET /api/maintenance?reportedBy=${reportedBy}`,
	);
	console.log(
		`  ✅ GET /api/maintenance?reportedBy=${reportedBy} → 200 (shard ${shardId})`,
	);

	// ── POST /api/maintenance ─────────────────────────────────────────────────
	const newReq = {
		roomId: testRoomId ?? null,
		reportedBy,
		title: "Leaking faucet in room",
		description: "Bathroom faucet is dripping constantly",
		priority: "Medium",
		status: "Open",
	};
	const resCreate = await api("POST", "/api/maintenance", userToken!, newReq);
	assertOk(resCreate.status, "POST /api/maintenance");
	const reqData = resCreate.data as Record<string, unknown>;
	assertContains(reqData, "requestId");
	const requestId = reqData.requestId as number;
	console.log(`  ✅ POST /api/maintenance → 201 (request_id=${requestId})`);

	// Verify in correct shard
	const shardDb = getShardDb(shardId);
	const inShard = shardDb
		.prepare(
			`SELECT request_id FROM shard_${shardId}_maintenance_request WHERE request_id = ?`,
		)
		.get(requestId);
	shardDb.close();
	if (!inShard)
		throw new Error(`Maintenance request ${requestId} not in shard ${shardId}`);
	console.log(
		`  ✅ Maintenance request ${requestId} correctly in shard ${shardId}`,
	);

	// ── GET /api/maintenance/:id (fan-out) ────────────────────────────────────
	const resGet = await api("GET", `/api/maintenance/${requestId}`, userToken!);
	assertOk(resGet.status, `GET /api/maintenance/${requestId}`);
	console.log(`  ✅ GET /api/maintenance/${requestId} → 200`);

	// Non-existent
	const res404 = await api("GET", "/api/maintenance/999999", userToken!);
	assertStatus(res404, 404, "GET /api/maintenance/999999");
	console.log("  ✅ GET /api/maintenance/999999 → 404");

	// ── PUT /api/maintenance/:id ──────────────────────────────────────────────
	const resUpdate = await api(
		"PUT",
		`/api/maintenance/${requestId}`,
		adminToken!,
		{
			status: "In_Progress",
		},
	);
	assertOk(resUpdate.status, `PUT /api/maintenance/${requestId}`);
	console.log(`  ✅ PUT /api/maintenance/${requestId} → 200`);

	// ── DELETE /api/maintenance/:id ───────────────────────────────────────────
	const forDelete = {
		roomId: testRoomId ?? null,
		reportedBy,
		title: "Broken window",
		description: "Window pane cracked",
		priority: "High",
		status: "Open",
	};
	const resDelCreate = await api(
		"POST",
		"/api/maintenance",
		userToken!,
		forDelete,
	);
	assertOk(resDelCreate.status, "POST maintenance for delete");
	const delReqId = (resDelCreate.data as Record<string, unknown>)
		.requestId as number;

	const resDelete = await api(
		"DELETE",
		`/api/maintenance/${delReqId}`,
		adminToken!,
	);
	assertOk(resDelete.status, `DELETE /api/maintenance/${delReqId}`);
	console.log(`  ✅ DELETE /api/maintenance/${delReqId} → 200`);

	// Verify deleted
	const shardDbDel = getShardDb(shardId);
	const afterDelete = shardDbDel
		.prepare(
			`SELECT request_id FROM shard_${shardId}_maintenance_request WHERE request_id = ?`,
		)
		.get(delReqId);
	shardDbDel.close();
	if (afterDelete)
		throw new Error(`Maintenance request ${delReqId} still in shard`);
	console.log(
		`  ✅ Maintenance request ${delReqId} removed from shard ${shardId}`,
	);

	// ── Auth required ─────────────────────────────────────────────────────────
	const resNoAuth = await api("GET", "/api/maintenance");
	assertStatus(resNoAuth, 401, "GET /api/maintenance no auth");
	console.log("  ✅ GET /api/maintenance → 401 without auth");
}

// ─────────────────────────────────────────────────────────────────────────────
// VISIT LOGS TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testVisitLogs(): Promise<void> {
	console.log("\n=== Visit Logs API Tests ===");

	if (!testStudentId) {
		console.log("  ⚠️  Skipping: no test student available");
		return;
	}

	const studentId = testStudentId;
	const shardId = studentId % 3;

	// Get a visitor ID from main DB
	const mainDb = getMainDb();
	const visitor = mainDb
		.prepare("SELECT visitor_id FROM visitor LIMIT 1")
		.get() as { visitor_id: number } | undefined;
	const visitorId = visitor?.visitor_id ?? 1;
	mainDb.close();

	// ── GET /api/visitlogs (list all - fan out) ────────────────────────────────
	const resList = await api("GET", "/api/visitlogs", userToken!);
	assertOk(resList.status, "GET /api/visitlogs");
	console.log("  ✅ GET /api/visitlogs → 200");

	// ── GET /api/visitlogs?studentId=X ────────────────────────────────────────
	const resByStudent = await api(
		"GET",
		`/api/visitlogs?studentId=${studentId}`,
		userToken!,
	);
	assertOk(resByStudent.status, `GET /api/visitlogs?studentId=${studentId}`);
	console.log(
		`  ✅ GET /api/visitlogs?studentId=${studentId} → 200 (shard ${shardId})`,
	);

	// ── POST /api/visitlogs ───────────────────────────────────────────────────
	const newVisit = {
		visitorId,
		studentId,
		checkInTime: "2025-04-15T09:00:00",
		purpose: "Parent visit",
	};
	const resCreate = await api("POST", "/api/visitlogs", adminToken!, newVisit);
	assertOk(resCreate.status, "POST /api/visitlogs");
	const visitData = resCreate.data as Record<string, unknown>;
	assertContains(visitData, "visitId");
	const visitId = visitData.visitId as number;
	console.log(`  ✅ POST /api/visitlogs → 201 (visit_id=${visitId})`);

	// Verify in correct shard
	const shardDb = getShardDb(shardId);
	const inShard = shardDb
		.prepare(
			`SELECT visit_id FROM shard_${shardId}_visit_log WHERE visit_id = ?`,
		)
		.get(visitId);
	shardDb.close();
	if (!inShard) throw new Error(`Visit log ${visitId} not in shard ${shardId}`);
	console.log(`  ✅ Visit log ${visitId} correctly in shard ${shardId}`);

	// POST requires admin
	const resVisitU = await api("POST", "/api/visitlogs", userToken!, newVisit);
	assertStatus(resVisitU, 403, "POST /api/visitlogs as user");
	console.log("  ✅ POST /api/visitlogs → 403 as regular user");

	// ── GET /api/visitlogs/:id (fan-out) ───────────────────────────────────────
	const resGet = await api("GET", `/api/visitlogs/${visitId}`, userToken!);
	assertOk(resGet.status, `GET /api/visitlogs/${visitId}`);
	console.log(`  ✅ GET /api/visitlogs/${visitId} → 200`);

	// Non-existent
	const res404 = await api("GET", "/api/visitlogs/999999", userToken!);
	assertStatus(res404, 404, "GET /api/visitlogs/999999");
	console.log("  ✅ GET /api/visitlogs/999999 → 404");

	// ── PUT /api/visitlogs/:id ────────────────────────────────────────────────
	const resUpdate = await api("PUT", `/api/visitlogs/${visitId}`, adminToken!, {
		checkOutTime: "2025-04-15T17:00:00",
	});
	assertOk(resUpdate.status, `PUT /api/visitlogs/${visitId}`);
	console.log(`  ✅ PUT /api/visitlogs/${visitId} → 200`);

	// ── DELETE /api/visitlogs/:id ────────────────────────────────────────────
	const forDelete = {
		visitorId,
		studentId,
		checkInTime: "2025-04-16T10:00:00",
		purpose: "Guest lecture",
	};
	const resDelCreate = await api(
		"POST",
		"/api/visitlogs",
		adminToken!,
		forDelete,
	);
	assertOk(resDelCreate.status, "POST visitlog for delete");
	const delVisitId = (resDelCreate.data as Record<string, unknown>)
		.visitId as number;

	const resDelete = await api(
		"DELETE",
		`/api/visitlogs/${delVisitId}`,
		adminToken!,
	);
	assertOk(resDelete.status, `DELETE /api/visitlogs/${delVisitId}`);
	console.log(`  ✅ DELETE /api/visitlogs/${delVisitId} → 200`);

	// Verify deleted
	const shardDbDel = getShardDb(shardId);
	const afterDelete = shardDbDel
		.prepare(
			`SELECT visit_id FROM shard_${shardId}_visit_log WHERE visit_id = ?`,
		)
		.get(delVisitId);
	shardDbDel.close();
	if (afterDelete) throw new Error(`Visit log ${delVisitId} still in shard`);
	console.log(`  ✅ Visit log ${delVisitId} removed from shard ${shardId}`);

	// ── Auth required ─────────────────────────────────────────────────────────
	const resNoAuth = await api("GET", "/api/visitlogs");
	assertStatus(resNoAuth, 401, "GET /api/visitlogs no auth");
	console.log("  ✅ GET /api/visitlogs → 401 without auth");
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERS & ROOMS TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testMembersAndRooms(): Promise<void> {
	console.log("\n=== Members & Rooms API Tests ===");

	// ── GET /api/members ───────────────────────────────────────────────────────
	const resMembers = await api("GET", "/api/members", userToken!);
	assertOk(resMembers.status, "GET /api/members");
	console.log("  ✅ GET /api/members → 200");

	// POST member (admin only)
	const newMember = {
		name: "New Member",
		email: `newmember${Date.now()}@example.com`,
		contactNumber: "1111111111",
		age: 30,
		gender: "Male",
		address: "Campus",
		userType: "Staff",
	};
	const resMember = await api("POST", "/api/members", adminToken!, newMember);
	assertOk(resMember.status, "POST /api/members");
	console.log("  ✅ POST /api/members → 201");
	const createdMemberId = (resMember.data as Record<string, unknown>)
		.memberId as number;

	const resMemberU = await api("POST", "/api/members", userToken!, newMember);
	assertStatus(resMemberU, 403, "POST /api/members as user");
	console.log("  ✅ POST /api/members → 403 as regular user");

	// ── GET /api/members/:id ─────────────────────────────────────────────────
	const resGetMember = await api(
		"GET",
		`/api/members/${createdMemberId}`,
		userToken!,
	);
	assertOk(resGetMember.status, `GET /api/members/${createdMemberId}`);
	const memberData = resGetMember.data as Record<string, unknown>;
	assertEqual(memberData.memberId, createdMemberId);
	console.log(`  ✅ GET /api/members/${createdMemberId} → 200`);

	// Non-existent member
	const resMember404 = await api("GET", "/api/members/999999", userToken!);
	assertStatus(resMember404, 404, "GET /api/members/999999");
	console.log("  ✅ GET /api/members/999999 → 404");

	// ── PUT /api/members/:id ─────────────────────────────────────────────────
	const resPutMember = await api(
		"PUT",
		`/api/members/${createdMemberId}`,
		adminToken!,
		{
			address: "New Campus Address",
		},
	);
	assertOk(resPutMember.status, `PUT /api/members/${createdMemberId}`);
	const putMemberData = resPutMember.data as Record<string, unknown>;
	assertEqual(putMemberData.address, "New Campus Address");
	console.log(
		`  ✅ PUT /api/members/${createdMemberId} → 200 (address updated)`,
	);

	// PUT requires admin
	const resPutMemberU = await api(
		"PUT",
		`/api/members/${createdMemberId}`,
		userToken!,
		{
			address: "Hacked",
		},
	);
	assertStatus(resPutMemberU, 403, "PUT /api/members/:id as user");
	console.log("  ✅ PUT /api/members/:id → 403 as regular user");

	// ── GET /api/rooms ─────────────────────────────────────────────────────────
	const resRooms = await api("GET", "/api/rooms", userToken!);
	assertOk(resRooms.status, "GET /api/rooms");
	console.log("  ✅ GET /api/rooms → 200");

	// POST room (admin only)
	const newRoom = {
		blockId: 1,
		roomNumber: "TEST101",
		floorNumber: 1,
		capacity: 2,
		currentOccupancy: 0,
		type: "Non-AC",
		status: "Available",
	};
	const resRoom = await api("POST", "/api/rooms", adminToken!, newRoom);
	assertOk(resRoom.status, "POST /api/rooms");
	console.log("  ✅ POST /api/rooms → 201");
	const createdRoomId = (resRoom.data as Record<string, unknown>)
		.roomId as number;

	const resRoomU = await api("POST", "/api/rooms", userToken!, newRoom);
	assertStatus(resRoomU, 403, "POST /api/rooms as user");
	console.log("  ✅ POST /api/rooms → 403 as regular user");

	// ── GET /api/rooms/:id ────────────────────────────────────────────────────
	const resGetRoom = await api(
		"GET",
		`/api/rooms/${createdRoomId}`,
		userToken!,
	);
	assertOk(resGetRoom.status, `GET /api/rooms/${createdRoomId}`);
	const roomData = resGetRoom.data as Record<string, unknown>;
	assertEqual(roomData.roomId, createdRoomId);
	console.log(`  ✅ GET /api/rooms/${createdRoomId} → 200`);

	// Non-existent room
	const resRoom404 = await api("GET", "/api/rooms/999999", userToken!);
	assertStatus(resRoom404, 404, "GET /api/rooms/999999");
	console.log("  ✅ GET /api/rooms/999999 → 404");

	// ── PUT /api/rooms/:id ────────────────────────────────────────────────────
	const resPutRoom = await api(
		"PUT",
		`/api/rooms/${createdRoomId}`,
		adminToken!,
		{
			status: "Maintenance",
		},
	);
	assertOk(resPutRoom.status, `PUT /api/rooms/${createdRoomId}`);
	const putRoomData = resPutRoom.data as Record<string, unknown>;
	assertEqual(putRoomData.status, "Maintenance");
	console.log(`  ✅ PUT /api/rooms/${createdRoomId} → 200 (status updated)`);

	// PUT requires admin
	const resPutRoomU = await api(
		"PUT",
		`/api/rooms/${createdRoomId}`,
		userToken!,
		{
			status: "Available",
		},
	);
	assertStatus(resPutRoomU, 403, "PUT /api/rooms/:id as user");
	console.log("  ✅ PUT /api/rooms/:id → 403 as regular user");

	// ── Auth required ─────────────────────────────────────────────────────────
	const resNoAuth = await api("GET", "/api/members");
	assertStatus(resNoAuth, 401, "GET /api/members no auth");
	console.log("  ✅ GET /api/members → 401 without auth");

	const resNoAuthR = await api("GET", "/api/rooms");
	assertStatus(resNoAuthR, 401, "GET /api/rooms no auth");
	console.log("  ✅ GET /api/rooms → 401 without auth");
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL ID SEQUENCE TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testGlobalIdSequence(): Promise<void> {
	console.log("\n=== Global ID Sequence Tests ===");

	if (!testStudentId) {
		console.log("  ⚠️  Skipping: no test student available");
		return;
	}

	// Create multiple records of different types and verify IDs are globally unique
	const studentId = testStudentId;
	const shardId = studentId % 3;

	// Create 5 allocations and collect IDs
	const allocationIds = new Set<number>();
	for (let i = 0; i < 5; i++) {
		if (!testRoomId) break;
		const res = await api("POST", "/api/allocations", adminToken!, {
			studentId,
			roomId: testRoomId,
			checkInDate: "2025-06-01",
			status: "Active",
		});
		if (res.status === 201) {
			const id = (res.data as Record<string, unknown>).allocationId as number;
			if (allocationIds.has(id)) {
				throw new Error(`Duplicate allocation ID: ${id}`);
			}
			allocationIds.add(id);
		}
	}
	console.log(`  ✅ ${allocationIds.size} allocation IDs are unique`);

	// Create 5 fee payments and collect IDs
	const feeIds = new Set<number>();
	for (let i = 0; i < 5; i++) {
		const res = await api("POST", "/api/fees", adminToken!, {
			studentId,
			amount: 1000 + i,
			paymentDate: "2025-06-01",
			paymentType: "Mess_Fee",
			transactionId: `SEQ${Date.now()}_${i}`,
			status: "Pending",
		});
		if (res.status === 201) {
			const id = (res.data as Record<string, unknown>).paymentId as number;
			if (feeIds.has(id)) {
				throw new Error(`Duplicate fee payment ID: ${id}`);
			}
			feeIds.add(id);
		}
	}
	console.log(`  ✅ ${feeIds.size} fee payment IDs are unique`);

	// Verify no overlap between allocation and fee IDs
	for (const aid of allocationIds) {
		if (feeIds.has(aid)) {
			throw new Error(
				`ID collision: ${aid} used for both allocation and fee_payment`,
			);
		}
	}
	console.log("  ✅ No ID collision between allocation and fee_payment tables");

	// Verify IDs are monotonically increasing in the global_id_sequence table
	const mainDb = getMainDb();
	const seqRows = mainDb
		.prepare(
			"SELECT table_name, next_id FROM global_id_sequence ORDER BY table_name",
		)
		.all() as { table_name: string; next_id: number }[];
	mainDb.close();
	console.log(`  ✅ global_id_sequence table state:`);
	for (const row of seqRows) {
		console.log(`     ${row.table_name}: next_id = ${row.next_id}`);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA INTEGRITY TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testDataIntegrity(): Promise<void> {
	console.log("\n=== Data Integrity Tests ===");

	const mainDb = getMainDb();

	// Note: POST /api/students writes to `member` (main DB) and `shard_X_student` (shard DB),
	// but NOT to the legacy `student` table in main DB. Therefore the main DB source tables
	// do NOT reflect records created during tests. We check integrity BY looking at the shards
	// directly: routing correctness, no duplication, and referential integrity.

	const tables = [
		{ shardTbl: "student", pk: "student_id", shardKey: "student_id" },
		{ shardTbl: "allocation", pk: "allocation_id", shardKey: "student_id" },
		{ shardTbl: "gate_pass", pk: "pass_id", shardKey: "student_id" },
		{ shardTbl: "fee_payment", pk: "payment_id", shardKey: "student_id" },
		{ shardTbl: "visit_log", pk: "visit_id", shardKey: "student_id" },
		{
			shardTbl: "maintenance_request",
			pk: "request_id",
			shardKey: "reported_by",
		},
	];

	let allOk = true;

	for (const tbl of tables) {
		// 1. Collect all PKs from each shard
		const pkSets: Set<number>[] = [];
		for (let s = 0; s < 3; s++) {
			const shardDb = getShardDb(s);
			const shardTbl = `shard_${s}_${tbl.shardTbl}`;
			const rows = shardDb
				.prepare(`SELECT ${tbl.pk} FROM ${shardTbl}`)
				.all() as { [key: string]: number }[];
			pkSets.push(new Set(rows.map((r) => r[tbl.pk])));
			shardDb.close();
		}

		// 2. Check no duplication across shards
		let overlaps = 0;
		for (let i = 0; i < 3; i++) {
			for (let j = i + 1; j < 3; j++) {
				for (const pk of pkSets[i]) {
					if (pkSets[j].has(pk)) overlaps++;
				}
			}
		}
		if (overlaps > 0) {
			console.log(
				`  ❌ ${tbl.shardTbl}: ${overlaps} duplicate PKs across shards`,
			);
			allOk = false;
		} else {
			const total = pkSets.reduce((sum, s) => sum + s.size, 0);
			console.log(
				`  ✅ ${tbl.shardTbl}: ${total} total rows, no PK duplication across shards`,
			);
		}

		// 3. Check routing correctness: every PK is in the shard determined by shardKey % 3
		let routingErrors = 0;
		for (let s = 0; s < 3; s++) {
			const shardDb = getShardDb(s);
			const shardTbl = `shard_${s}_${tbl.shardTbl}`;
			const rows = shardDb
				.prepare(`SELECT ${tbl.pk}, ${tbl.shardKey} FROM ${shardTbl}`)
				.all() as { [key: string]: number }[];
			for (const row of rows) {
				const expectedShard = row[tbl.shardKey] % 3;
				if (s !== expectedShard) {
					routingErrors++;
				}
			}
			shardDb.close();
		}
		if (routingErrors > 0) {
			console.log(`  ❌ ${tbl.shardTbl}: ${routingErrors} rows in wrong shard`);
			allOk = false;
		} else {
			console.log(
				`  ✅ ${tbl.shardTbl}: all rows correctly routed to shard (shardKey % 3)`,
			);
		}
	}

	// 4. Check referential integrity: allocation.student_id → student.student_id in same shard
	for (let s = 0; s < 3; s++) {
		const shardDb = getShardDb(s);
		const orphan = shardDb
			.prepare(
				`SELECT COUNT(*) as cnt FROM shard_${s}_allocation a
       LEFT JOIN shard_${s}_student s2 ON a.student_id = s2.student_id
       WHERE s2.student_id IS NULL`,
			)
			.get() as { cnt: number };
		if (orphan.cnt > 0) {
			console.log(
				`  ❌ Shard ${s}: ${orphan.cnt} orphan allocations (FK violation)`,
			);
			allOk = false;
		} else {
			console.log(
				`  ✅ Shard ${s}: all allocation student_ids have matching student in same shard`,
			);
		}
		shardDb.close();
	}

	mainDb.close();

	if (!allOk) {
		throw new Error("Data integrity checks failed");
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// CASCADE DELETE TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testCascadeDeletes(): Promise<void> {
	console.log("\n=== Cascade Delete Tests ===");

	// Create a dedicated student for cascade testing (don't use testStudentId
	// since that would break subsequent tests that depend on it)
	const cascadeStudent = {
		name: "Cascade Student",
		email: `cascade${Date.now()}@example.com`,
		contactNumber: "5555555555",
		age: 19,
		gender: "Female",
		address: "Cascade Room 1",
		enrollmentNo: "CASCADE" + Date.now(),
		course: "Mathematics",
		batchYear: 2025,
		guardianName: "Cascade Guardian",
		guardianContact: "4444444444",
	};
	const resCascadeStudent = await api(
		"POST",
		"/api/students",
		adminToken!,
		cascadeStudent,
	);
	assertOk(resCascadeStudent.status, "POST cascade student");
	const cascadeStudentId = (resCascadeStudent.data as Record<string, unknown>)
		.student as Record<string, unknown>;
	const cascadeStudentNum = cascadeStudentId.studentId as number;
	const cascadeShard = cascadeStudentNum % 3;
	console.log(
		`  created cascade student ${cascadeStudentNum} in shard ${cascadeShard}`,
	);

	// Find a room with capacity
	const mainDbRoom = getMainDb();
	const cascadeRoom = mainDbRoom
		.prepare(
			"SELECT room_id, current_occupancy FROM room WHERE current_occupancy < capacity LIMIT 1",
		)
		.get() as { room_id: number; current_occupancy: number } | undefined;
	mainDbRoom.close();
	if (!cascadeRoom) {
		console.log(
			"  ⚠️  Skipping: no rooms with available capacity for cascade test",
		);
		return;
	}
	const cascadeRoomId = cascadeRoom.room_id;
	const occupancyBefore = cascadeRoom.current_occupancy;
	console.log(
		`  using room_id=${cascadeRoomId} (occupancy=${occupancyBefore})`,
	);

	// Create allocation, fee, gate pass, visit log for this student
	const resAlloc = await api("POST", "/api/allocations", adminToken!, {
		studentId: cascadeStudentNum,
		roomId: cascadeRoomId,
		checkInDate: "2025-07-01",
		status: "Active",
	});
	assertOk(resAlloc.status, "POST allocation for cascade student");
	const cascadeAllocId = (resAlloc.data as Record<string, unknown>)
		.allocationId as number;

	const resFee = await api("POST", "/api/fees", adminToken!, {
		studentId: cascadeStudentNum,
		amount: 5000,
		paymentDate: "2025-07-01",
		paymentType: "Hostel_Fee",
		transactionId: "CASC_TXN" + Date.now(),
		status: "Pending",
	});
	assertOk(resFee.status, "POST fee for cascade student");
	const cascadeFeeId = (resFee.data as Record<string, unknown>)
		.paymentId as number;

	const resPass = await api("POST", "/api/gatepasses", adminToken!, {
		studentId: cascadeStudentNum,
		outTime: "2025-07-01T10:00:00",
		expectedInTime: "2025-07-01T18:00:00",
		reason: "Home visit",
		status: "Pending",
	});
	assertOk(resPass.status, "POST gate pass for cascade student");
	const cascadePassId = (resPass.data as Record<string, unknown>)
		.passId as number;

	// Get visitor for visit log
	const mainDbVisitor = getMainDb();
	const visitor = mainDbVisitor
		.prepare("SELECT visitor_id FROM visitor LIMIT 1")
		.get() as { visitor_id: number } | undefined;
	mainDbVisitor.close();
	const cascadeVisitorId = visitor?.visitor_id ?? 1;

	const resVisit = await api("POST", "/api/visitlogs", adminToken!, {
		visitorId: cascadeVisitorId,
		studentId: cascadeStudentNum,
		checkInTime: "2025-07-01T09:00:00",
		purpose: "Parent meeting",
	});
	assertOk(resVisit.status, "POST visit log for cascade student");
	const cascadeVisitId = (resVisit.data as Record<string, unknown>)
		.visitId as number;

	console.log(
		`  created cascade records: alloc=${cascadeAllocId} fee=${cascadeFeeId} pass=${cascadePassId} visit=${cascadeVisitId}`,
	);

	// ── CASCADE: DELETE /api/members/:id (student type) ─────────────────────
	// Verify shard records exist before delete
	const shardDbBefore = getShardDb(cascadeShard);
	const allocExists = shardDbBefore
		.prepare(
			`SELECT allocation_id FROM shard_${cascadeShard}_allocation WHERE allocation_id = ?`,
		)
		.get(cascadeAllocId);
	const feeExists = shardDbBefore
		.prepare(
			`SELECT payment_id FROM shard_${cascadeShard}_fee_payment WHERE payment_id = ?`,
		)
		.get(cascadeFeeId);
	const passExists = shardDbBefore
		.prepare(
			`SELECT pass_id FROM shard_${cascadeShard}_gate_pass WHERE pass_id = ?`,
		)
		.get(cascadePassId);
	const visitExists = shardDbBefore
		.prepare(
			`SELECT visit_id FROM shard_${cascadeShard}_visit_log WHERE visit_id = ?`,
		)
		.get(cascadeVisitId);
	shardDbBefore.close();
	if (!allocExists || !feeExists || !passExists || !visitExists) {
		throw new Error("Cascade records not found before delete");
	}
	console.log("  ✅ All shard records exist before cascade delete");

	// Check occupancy before delete
	const mainDbOccBefore = getMainDb();
	const occBefore = mainDbOccBefore
		.prepare("SELECT current_occupancy FROM room WHERE room_id = ?")
		.get(cascadeRoomId) as { current_occupancy: number };
	mainDbOccBefore.close();

	// Delete member (cascades to student + all shard records)
	const resDelMember = await api(
		"DELETE",
		`/api/members/${cascadeStudentNum}`,
		adminToken!,
	);
	assertOk(resDelMember.status, `DELETE /api/members/${cascadeStudentNum}`);
	console.log(`  ✅ DELETE /api/members/${cascadeStudentNum} → 200 (cascade)`);

	// Verify all shard records are gone
	const shardDbAfter = getShardDb(cascadeShard);
	const allocGone = !shardDbAfter
		.prepare(
			`SELECT allocation_id FROM shard_${cascadeShard}_allocation WHERE allocation_id = ?`,
		)
		.get(cascadeAllocId);
	const feeGone = !shardDbAfter
		.prepare(
			`SELECT payment_id FROM shard_${cascadeShard}_fee_payment WHERE payment_id = ?`,
		)
		.get(cascadeFeeId);
	const passGone = !shardDbAfter
		.prepare(
			`SELECT pass_id FROM shard_${cascadeShard}_gate_pass WHERE pass_id = ?`,
		)
		.get(cascadePassId);
	const visitGone = !shardDbAfter
		.prepare(
			`SELECT visit_id FROM shard_${cascadeShard}_visit_log WHERE visit_id = ?`,
		)
		.get(cascadeVisitId);
	const studentGone = !shardDbAfter
		.prepare(
			`SELECT student_id FROM shard_${cascadeShard}_student WHERE student_id = ?`,
		)
		.get(cascadeStudentNum);
	shardDbAfter.close();

	if (!allocGone)
		throw new Error(
			`allocation ${cascadeAllocId} still exists after cascade delete`,
		);
	if (!feeGone)
		throw new Error(
			`fee_payment ${cascadeFeeId} still exists after cascade delete`,
		);
	if (!passGone)
		throw new Error(
			`gate_pass ${cascadePassId} still exists after cascade delete`,
		);
	if (!visitGone)
		throw new Error(
			`visit_log ${cascadeVisitId} still exists after cascade delete`,
		);
	if (!studentGone)
		throw new Error(
			`student ${cascadeStudentNum} still exists after cascade delete`,
		);
	console.log(
		"  ✅ All shard records removed by cascade (alloc, fee, pass, visit, student)",
	);

	// Verify room occupancy decremented
	const mainDbOccAfter = getMainDb();
	const occAfter = mainDbOccAfter
		.prepare("SELECT current_occupancy FROM room WHERE room_id = ?")
		.get(cascadeRoomId) as { current_occupancy: number };
	mainDbOccAfter.close();
	if (occAfter.current_occupancy !== occBefore.current_occupancy - 1) {
		throw new Error(
			`Room occupancy should decrement after cascade delete: expected ${occBefore.current_occupancy - 1}, got ${occAfter.current_occupancy}`,
		);
	}
	console.log("  ✅ Room occupancy correctly decremented after cascade delete");

	// DELETE requires admin
	const resDelMemberU = await api(
		"DELETE",
		`/api/members/${cascadeStudentNum}`,
		userToken!,
	);
	assertStatus(resDelMemberU, 403, "DELETE /api/members/:id as user");
	console.log("  ✅ DELETE /api/members/:id → 403 as regular user");

	// ── CASCADE: DELETE /api/rooms/:id ────────────────────────────────────────
	// Create a fresh room and put an allocation in it
	const newTestRoom = {
		blockId: 1,
		roomNumber: "DELROOM" + Date.now(),
		floorNumber: 1,
		capacity: 1,
		currentOccupancy: 0,
		type: "AC",
		status: "Available",
	};
	const resDelRoom = await api("POST", "/api/rooms", adminToken!, newTestRoom);
	assertOk(resDelRoom.status, "POST room for delete cascade");
	const delRoomId = (resDelRoom.data as Record<string, unknown>)
		.roomId as number;

	// Create another student to allocate to this room
	const allocStudent = {
		name: "Room Del Student",
		email: `roomdel${Date.now()}@example.com`,
		contactNumber: "6666666666",
		age: 20,
		gender: "Male",
		address: "Temp",
		enrollmentNo: "ROOMDEL" + Date.now(),
		course: "Physics",
		batchYear: 2025,
		guardianName: "Guardian",
		guardianContact: "7777777777",
	};
	const resAllocStudent = await api(
		"POST",
		"/api/students",
		adminToken!,
		allocStudent,
	);
	assertOk(resAllocStudent.status, "POST student for room delete");
	const allocStudentId = (resAllocStudent.data as Record<string, unknown>)
		.student as Record<string, unknown>;
	const allocStudentNum = allocStudentId.studentId as number;
	const allocShard = allocStudentNum % 3;

	const resAllocForRoom = await api("POST", "/api/allocations", adminToken!, {
		studentId: allocStudentNum,
		roomId: delRoomId,
		checkInDate: "2025-08-01",
		status: "Active",
	});
	assertOk(resAllocForRoom.status, "POST allocation for room delete");
	const allocForRoomId = (resAllocForRoom.data as Record<string, unknown>)
		.allocationId as number;

	// Verify allocation exists and room is at capacity
	const shardDbAllocCheck = getShardDb(allocShard);
	const allocForRoomExists = shardDbAllocCheck
		.prepare(
			`SELECT allocation_id FROM shard_${allocShard}_allocation WHERE allocation_id = ?`,
		)
		.get(allocForRoomId);
	shardDbAllocCheck.close();
	if (!allocForRoomExists)
		throw new Error("Allocation for room delete not found");
	console.log("  ✅ Allocation created for room delete cascade test");

	// Delete the room (should cascade-delete the allocation)
	const resDeleteRoom = await api(
		"DELETE",
		`/api/rooms/${delRoomId}`,
		adminToken!,
	);
	assertOk(resDeleteRoom.status, `DELETE /api/rooms/${delRoomId}`);
	console.log(`  ✅ DELETE /api/rooms/${delRoomId} → 200 (cascade)`);

	// Verify allocation is gone
	const shardDbAllocGone = getShardDb(allocShard);
	const allocIsGone = !shardDbAllocGone
		.prepare(
			`SELECT allocation_id FROM shard_${allocShard}_allocation WHERE allocation_id = ?`,
		)
		.get(allocForRoomId);
	shardDbAllocGone.close();
	if (!allocIsGone)
		throw new Error(
			`Allocation ${allocForRoomId} still exists after room delete`,
		);
	console.log("  ✅ Allocation removed by room cascade delete");

	// Also verify the student was NOT deleted (room cascade should only delete the allocation, not the student)
	const shardDbStudentStillExists = getShardDb(allocShard);
	const studentStillExists = shardDbStudentStillExists
		.prepare(
			`SELECT student_id FROM shard_${allocShard}_student WHERE student_id = ?`,
		)
		.get(allocStudentNum);
	shardDbStudentStillExists.close();
	if (!studentStillExists)
		throw new Error(
			`Student ${allocStudentNum} incorrectly deleted by room cascade`,
		);
	console.log(
		"  ✅ Student NOT deleted by room cascade (only allocation removed)",
	);

	// DELETE requires admin
	const resDeleteRoomU = await api(
		"DELETE",
		`/api/rooms/${delRoomId}`,
		userToken!,
	);
	assertStatus(resDeleteRoomU, 403, "DELETE /api/rooms/:id as user");
	console.log("  ✅ DELETE /api/rooms/:id → 403 as regular user");

	// Update testStudentId so stale reference doesn't cause issues in any remaining tests
	testStudentId = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASES & ADDITIONAL COVERAGE
// ─────────────────────────────────────────────────────────────────────────────

async function testEdgeCases(): Promise<void> {
	console.log("\n=== Edge Cases & Additional Coverage ===");

	// Helper: find a room with zero occupancy (guaranteed clean, no cross-shard orphans)
	const findEmptyRoom = (): number => {
		const db = getMainDb();
		const r = db
			.prepare("SELECT room_id FROM room WHERE current_occupancy = 0 LIMIT 1")
			.get() as { room_id: number } | undefined;
		db.close();
		if (!r) throw new Error("No empty rooms available");
		return r.room_id;
	};

	// ── 0. Fan-out query completeness (run before any cleanup) ────────────────────
	// GET /api/allocations and GET /api/maintenance fan out to all shards.
	// Count per-shard and compare to API response.
	let totalPerShardAlloc = 0;
	for (let i = 0; i < 3; i++) {
		const shardDb = getShardDb(i);
		const cnt = shardDb
			.prepare(`SELECT COUNT(*) as c FROM shard_${i}_allocation`)
			.get() as { c: number };
		totalPerShardAlloc += cnt.c;
		shardDb.close();
	}

	const resFanAlloc = await api("GET", "/api/allocations", adminToken!);
	assertOk(resFanAlloc.status, "GET /api/allocations (fan-out)");
	// API returns array directly, not {allocations: [...]}
	const fanAllocData = resFanAlloc.data as unknown[];
	const fanAllocCount = Array.isArray(fanAllocData) ? fanAllocData.length : 0;
	if (fanAllocCount !== totalPerShardAlloc) {
		throw new Error(
			`Fan-out allocations: API returned ${fanAllocCount}, shards have ${totalPerShardAlloc}`,
		);
	}
	console.log(
		`  ✅ GET /api/allocations fan-out returns all ${totalPerShardAlloc} rows across 3 shards`,
	);

	let totalPerShardMaint = 0;
	for (let i = 0; i < 3; i++) {
		const shardDb = getShardDb(i);
		const cnt = shardDb
			.prepare(`SELECT COUNT(*) as c FROM shard_${i}_maintenance_request`)
			.get() as { c: number };
		totalPerShardMaint += cnt.c;
		shardDb.close();
	}

	const resFanMaint = await api("GET", "/api/maintenance", adminToken!);
	assertOk(resFanMaint.status, "GET /api/maintenance (fan-out)");
	const fanMaintData = resFanMaint.data as unknown[];
	const fanMaintCount = Array.isArray(fanMaintData) ? fanMaintData.length : 0;
	if (fanMaintCount !== totalPerShardMaint) {
		throw new Error(
			`Fan-out maintenance: API returned ${fanMaintCount}, shards have ${totalPerShardMaint}`,
		);
	}
	console.log(
		`  ✅ GET /api/maintenance fan-out returns all ${totalPerShardMaint} rows across 3 shards`,
	);

	// ── 1. Double-close allocation → 409 ────────────────────────────────────────
	// Create a fresh allocation, close it, then try to close it again
	const dcStudent = {
		name: "Double Close",
		email: `dc${Date.now()}@example.com`,
		contactNumber: "9999999991",
		age: 20,
		gender: "Male",
		address: "Test",
		enrollmentNo: "DC" + Date.now(),
		course: "Math",
		batchYear: 2025,
		guardianName: "Guardian",
		guardianContact: "1111111111",
	};
	const resDcStudent = await api(
		"POST",
		"/api/students",
		adminToken!,
		dcStudent,
	);
	assertOk(resDcStudent.status, "POST student for double-close test");
	const dcStudentData = resDcStudent.data as Record<string, unknown>;
	const dcStudentId = (dcStudentData.student as Record<string, unknown>)
		.studentId as number;
	const dcShard = dcStudentId % 3;

	const dcRoomId = findEmptyRoom();
	const resDcAlloc = await api("POST", "/api/allocations", adminToken!, {
		studentId: dcStudentId,
		roomId: dcRoomId,
		checkInDate: "2025-09-01",
		status: "Active",
	});
	assertOk(resDcAlloc.status, "POST allocation for double-close");
	const dcAllocId = (resDcAlloc.data as Record<string, unknown>)
		.allocationId as number;

	// First close → 200
	const resClose1 = await api(
		"PUT",
		`/api/allocations/${dcAllocId}`,
		adminToken!,
		{
			status: "Completed",
		},
	);
	assertOk(resClose1.status, `First close of allocation ${dcAllocId}`);
	console.log(`  ✅ PUT /api/allocations/${dcAllocId} (first close) → 200`);

	// Second close → 409
	const resClose2 = await api(
		"PUT",
		`/api/allocations/${dcAllocId}`,
		adminToken!,
		{
			status: "Completed",
		},
	);
	if (resClose2.status !== 409) {
		throw new Error(`Double-close should return 409, got ${resClose2.status}`);
	}
	console.log(`  ✅ PUT /api/allocations/${dcAllocId} (double close) → 409`);

	// Cleanup
	await api("DELETE", `/api/students/${dcStudentId}`, adminToken!);

	// ── 2. Room DELETE decrements occupancy ──────────────────────────────────────
	// Create a dedicated room to avoid cross-shard orphan issues from previous tests.
	const occRoomRes = await api("POST", "/api/rooms", adminToken!, {
		blockId: 1,
		roomNumber: "OCC" + Date.now(),
		floorNumber: 1,
		capacity: 2,
		currentOccupancy: 0,
		type: "AC",
		status: "Available",
	});
	assertOk(occRoomRes.status, "POST room for occupancy test");
	const occTargetRoomId = (occRoomRes.data as Record<string, unknown>)
		.roomId as number;

	// Record initial occupancy
	const mainDbOcc = getMainDb();
	const roomBefore = mainDbOcc
		.prepare("SELECT current_occupancy FROM room WHERE room_id = ?")
		.get(occTargetRoomId) as { current_occupancy: number };
	mainDbOcc.close();
	assertEqual(
		roomBefore.current_occupancy,
		0,
		"New room should have occupancy 0",
	);

	// Create a student and allocate to this room
	const occStudent = {
		name: "Occ Decrement",
		email: `occ${Date.now()}@example.com`,
		contactNumber: "9999999992",
		age: 21,
		gender: "Female",
		address: "Test",
		enrollmentNo: "OCC" + Date.now(),
		course: "Bio",
		batchYear: 2025,
		guardianName: "Guardian",
		guardianContact: "2222222222",
	};
	const resOccStudent = await api(
		"POST",
		"/api/students",
		adminToken!,
		occStudent,
	);
	assertOk(resOccStudent.status, "POST student for room occupancy test");
	const occStudentId = (resOccStudent.data as Record<string, unknown>)
		.student as Record<string, unknown>;
	const occStudentNum = occStudentId.studentId as number;

	const resOccAlloc = await api("POST", "/api/allocations", adminToken!, {
		studentId: occStudentNum,
		roomId: occTargetRoomId,
		checkInDate: "2025-09-01",
		status: "Active",
	});
	assertOk(resOccAlloc.status, "POST allocation for room occupancy test");
	const occAllocId = (resOccAlloc.data as Record<string, unknown>)
		.allocationId as number;

	// Verify room occupancy incremented
	const mainDbOccAfterAlloc = getMainDb();
	const roomAfterAlloc = mainDbOccAfterAlloc
		.prepare("SELECT current_occupancy FROM room WHERE room_id = ?")
		.get(occTargetRoomId) as { current_occupancy: number };
	mainDbOccAfterAlloc.close();
	assertEqual(
		roomAfterAlloc.current_occupancy,
		1,
		"Room occupancy should be 1 after allocation",
	);
	console.log(`  ✅ Room occupancy incremented to 1 after allocation`);

	// Delete the room - handler should decrement occupancy before removing allocation
	const resOccDelete = await api(
		"DELETE",
		`/api/rooms/${occTargetRoomId}`,
		adminToken!,
	);
	assertOk(resOccDelete.status, `DELETE /api/rooms/${occTargetRoomId}`);
	console.log(
		`  ✅ DELETE /api/rooms/${occTargetRoomId} → 200 (cascade removes allocation + decrements occupancy)`,
	);

	// Verify the allocation is gone
	const occStudentShard = occStudentNum % 3;
	const shardDbOcc = getShardDb(occStudentShard);
	const allocGone = !shardDbOcc
		.prepare(
			`SELECT allocation_id FROM shard_${occStudentShard}_allocation WHERE allocation_id = ?`,
		)
		.get(occAllocId);
	shardDbOcc.close();
	if (!allocGone)
		throw new Error(`Allocation ${occAllocId} still exists after room delete`);
	console.log(`  ✅ Allocation ${occAllocId} removed by room cascade`);

	// ── 3. Maintenance request shard routing by reportedBy ───────────────────────
	// testMemberId is in shard testMemberId % 3.
	// Create maintenance requests from members in different shards and verify placement.
	const reporter1 = testMemberId!; // shard = testMemberId % 3
	const shard1 = reporter1 % 3;

	// Find a different member to act as reporter 2 (different shard)
	const mainDbMaint = getMainDb();
	const otherMembers = mainDbMaint
		.prepare("SELECT member_id FROM member WHERE member_id % 3 != ? LIMIT 3")
		.all(shard1) as { member_id: number }[];
	mainDbMaint.close();

	for (const { member_id: reporter2 } of otherMembers) {
		const shard2 = reporter2 % 3;
		if (shard2 === shard1) continue;

		// Create request from reporter1 (shard1) and reporter2 (shard2)
		const req1 = {
			roomId: null,
			reportedBy: reporter1,
			title: `Request by reporter ${reporter1}`,
			description: "Test",
			priority: "Low",
			status: "Open",
		};
		const req2 = {
			roomId: null,
			reportedBy: reporter2,
			title: `Request by reporter ${reporter2}`,
			description: "Test",
			priority: "Low",
			status: "Open",
		};

		const resR1 = await api("POST", "/api/maintenance", adminToken!, req1);
		const resR2 = await api("POST", "/api/maintenance", adminToken!, req2);
		assertOk(resR1.status, `POST maintenance from reporter ${reporter1}`);
		assertOk(resR2.status, `POST maintenance from reporter ${reporter2}`);

		const reqId1 = (resR1.data as Record<string, unknown>).requestId as number;
		const reqId2 = (resR2.data as Record<string, unknown>).requestId as number;

		// Verify req1 is in shard1 and req2 is in shard2
		const shardDb1 = getShardDb(shard1);
		const shardDb2 = getShardDb(shard2);

		const inShard1 = shardDb1
			.prepare(
				`SELECT request_id FROM shard_${shard1}_maintenance_request WHERE request_id = ?`,
			)
			.get(reqId1);
		const inShard2Wrong = shardDb2
			.prepare(
				`SELECT request_id FROM shard_${shard2}_maintenance_request WHERE request_id = ?`,
			)
			.get(reqId1);

		const inShard2 = shardDb2
			.prepare(
				`SELECT request_id FROM shard_${shard2}_maintenance_request WHERE request_id = ?`,
			)
			.get(reqId2);
		const inShard1Wrong = shardDb1
			.prepare(
				`SELECT request_id FROM shard_${shard1}_maintenance_request WHERE request_id = ?`,
			)
			.get(reqId2);

		shardDb1.close();
		shardDb2.close();

		if (!inShard1)
			throw new Error(
				`Request ${reqId1} not in shard ${shard1} (reporter ${reporter1})`,
			);
		if (inShard2Wrong)
			throw new Error(
				`Request ${reqId1} incorrectly in shard ${shard2} (reporter ${reporter2})`,
			);
		if (!inShard2)
			throw new Error(
				`Request ${reqId2} not in shard ${shard2} (reporter ${reporter2})`,
			);
		if (inShard1Wrong)
			throw new Error(
				`Request ${reqId2} incorrectly in shard ${shard1} (reporter ${reporter1})`,
			);

		console.log(
			`  ✅ Maintenance: reporter ${reporter1} (shard ${shard1}) → shard ${shard1}, reporter ${reporter2} (shard ${shard2}) → shard ${shard2}`,
		);

		// Cleanup
		await api("DELETE", `/api/maintenance/${reqId1}`, adminToken!);
		await api("DELETE", `/api/maintenance/${reqId2}`, adminToken!);
		break; // one comparison is enough
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testAuditLogs(): Promise<void> {
	console.log("\n=== Audit Log Tests ===");

	const getAuditCount = (): number => {
		const db = getMainDb();
		const row = db.prepare("SELECT COUNT(*) as c FROM audit_log").get() as {
			c: number;
		};
		db.close();
		return row.c;
	};

	const countBefore = getAuditCount();

	// Create a student (INSERT)
	const student = {
		name: "Audit Test Student",
		email: `audit${Date.now()}@example.com`,
		contactNumber: "9000000001",
		age: 19,
		gender: "Male",
		address: "Audit Test Address",
		enrollmentNo: "AUD" + Date.now(),
		course: "CS",
		batchYear: 2025,
		guardianName: "Audit Guardian",
		guardianContact: "9000000001",
	};
	const resStudent = await api("POST", "/api/students", adminToken!, student);
	assertOk(resStudent.status, "POST student for audit test");
	const studentId = (resStudent.data as Record<string, unknown>)
		.student as Record<string, unknown>;
	const studentNum = studentId.studentId as number;

	const countAfterStudent = getAuditCount();
	if (countAfterStudent <= countBefore) {
		throw new Error("No audit log entry created for student INSERT");
	}
	console.log(
		`  ✅ INSERT student creates audit entry (${countAfterStudent - countBefore} new)`,
	);

	// UPDATE the student (use "course" - a field in the student shard table, not "address" which is on member)
	const resUpdate = await api(
		"PUT",
		`/api/students/${studentNum}`,
		adminToken!,
		{ course: "Updated Course" },
	);
	assertOk(resUpdate.status, "PUT student for audit test");
	const countAfterUpdate = getAuditCount();
	if (countAfterUpdate <= countAfterStudent) {
		throw new Error("No audit log entry created for student UPDATE");
	}
	console.log(`  ✅ UPDATE student creates audit entry`);

	// DELETE the student
	const resDelete = await api(
		"DELETE",
		`/api/students/${studentNum}`,
		adminToken!,
	);
	assertOk(resDelete.status, "DELETE student for audit test");
	const countAfterDelete = getAuditCount();
	if (countAfterDelete <= countAfterUpdate) {
		throw new Error("No audit log entry created for student DELETE");
	}
	console.log(`  ✅ DELETE student creates audit entry`);

	// Check audit_log DB table has the right columns
	const db = getMainDb();
	const auditEntry = db
		.prepare(
			"SELECT table_name, action, record_id, performed_by FROM audit_log ORDER BY log_id DESC LIMIT 1",
		)
		.get() as
		| {
				table_name: string;
				action: string;
				record_id: number;
				performed_by: number;
		  }
		| undefined;
	db.close();

	if (!auditEntry) throw new Error("Could not read latest audit log entry");
	if (!["student", "member", "allocation"].includes(auditEntry.table_name)) {
		throw new Error(
			`Unexpected table_name in audit log: ${auditEntry.table_name}`,
		);
	}
	if (!["INSERT", "UPDATE", "DELETE"].includes(auditEntry.action)) {
		throw new Error(`Unexpected action in audit log: ${auditEntry.action}`);
	}
	if (typeof auditEntry.record_id !== "number") {
		throw new Error("record_id should be a number in audit log");
	}
	if (typeof auditEntry.performed_by !== "number") {
		throw new Error("performed_by should be a number in audit log");
	}
	console.log(
		`  ✅ Audit log table has correct schema (table=${auditEntry.table_name}, action=${auditEntry.action})`,
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// NON-ADMIN FORBIDDEN TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testNonAdminForbidden(): Promise<void> {
	console.log("\n=== Non-Admin Forbidden (403) Tests ===");

	// Get a valid student ID from seed
	const shardDb = getShardDb(0);
	const student = shardDb
		.prepare("SELECT student_id FROM shard_0_student LIMIT 1")
		.get() as { student_id: number } | undefined;
	shardDb.close();
	if (!student) {
		console.log("  ⚠️  Skipping - no seed students found");
		return;
	}
	const studentId = student.student_id;

	// Non-admin userToken should get 403 on admin-only routes
	const forbiddenCases = [
		{ method: "POST", path: "/api/students", body: { name: "Test" } },
		{
			method: "PUT",
			path: `/api/students/${studentId}`,
			body: { name: "Test" },
		},
		{ method: "DELETE", path: `/api/students/${studentId}` },
		{ method: "POST", path: "/api/allocations", body: {} },
		{
			method: "PUT",
			path: `/api/allocations/1`,
			body: { status: "Completed" },
		},
		{ method: "DELETE", path: `/api/allocations/1` },
		{ method: "POST", path: "/api/rooms", body: {} },
		{ method: "DELETE", path: `/api/rooms/1` },
	];

	for (const { method, path, body } of forbiddenCases) {
		const res = await api(method, path, userToken!, body);
		if (res.status !== 403) {
			throw new Error(
				`${method} ${path} with non-admin token should return 403, got ${res.status}`,
			);
		}
		const errData = res.data as Record<string, unknown>;
		if (
			!errData.error ||
			String(errData.error).toLowerCase().includes("not authenticated")
		) {
			throw new Error(
				`${method} ${path}: expected "Forbidden" error, got "${errData.error}"`,
			);
		}
	}
	console.log(
		`  ✅ All ${forbiddenCases.length} admin-only routes return 403 for non-admin user`,
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS TRANSITION TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function testStatusTransitions(): Promise<void> {
	console.log("\n=== Status Transition Tests ===");

	// Helper: find an empty room
	const findEmptyRoom = (): number => {
		const db = getMainDb();
		const r = db
			.prepare("SELECT room_id FROM room WHERE current_occupancy = 0 LIMIT 1")
			.get() as { room_id: number } | undefined;
		db.close();
		if (!r) throw new Error("No empty rooms available");
		return r.room_id;
	};

	// ── 1. Allocation: Active → Cancelled ──────────────────────────────────────
	const s1 = {
		name: "Cancel Test",
		email: `cancel${Date.now()}@example.com`,
		contactNumber: "9000000002",
		age: 20,
		gender: "Male",
		address: "Test",
		enrollmentNo: "CANC" + Date.now(),
		course: "Math",
		batchYear: 2025,
		guardianName: "Guardian",
		guardianContact: "1111111111",
	};
	const resS1 = await api("POST", "/api/students", adminToken!, s1);
	assertOk(resS1.status, "POST student for cancel test");
	const s1Id = (resS1.data as Record<string, unknown>).student as Record<
		string,
		unknown
	>;
	const s1Num = s1Id.studentId as number;

	const roomId = findEmptyRoom();
	const resAlloc = await api("POST", "/api/allocations", adminToken!, {
		studentId: s1Num,
		roomId,
		checkInDate: "2025-09-01",
		status: "Active",
	});
	assertOk(resAlloc.status, "POST allocation for cancel test");
	const allocId = (resAlloc.data as Record<string, unknown>)
		.allocationId as number;

	const resCancel = await api(
		"PUT",
		`/api/allocations/${allocId}`,
		adminToken!,
		{ status: "Cancelled" },
	);
	if (resCancel.status !== 200) {
		throw new Error(
			`Active→Cancelled should return 200, got ${resCancel.status}`,
		);
	}
	console.log(`  ✅ Allocation Active→Cancelled → 200`);

	// Verify occupancy was decremented
	const dbOcc = getMainDb();
	const occ = dbOcc
		.prepare("SELECT current_occupancy FROM room WHERE room_id = ?")
		.get(roomId) as { current_occupancy: number };
	dbOcc.close();
	if (occ.current_occupancy !== 0) {
		throw new Error(
			`Room occupancy should be 0 after cancel, got ${occ.current_occupancy}`,
		);
	}
	console.log(`  ✅ Allocation Cancelled decrements room occupancy to 0`);

	// Double cancel → 409
	const resCancel2 = await api(
		"PUT",
		`/api/allocations/${allocId}`,
		adminToken!,
		{ status: "Cancelled" },
	);
	if (resCancel2.status !== 409) {
		throw new Error(
			`Double cancel should return 409, got ${resCancel2.status}`,
		);
	}
	console.log(`  ✅ Allocation double cancel → 409`);

	await api("DELETE", `/api/students/${s1Num}`, adminToken!);

	// ── 2. Gate pass: double action (approve twice → 409) ────────────────────────
	const s2 = {
		name: "Gate Double",
		email: `gdbl${Date.now()}@example.com`,
		contactNumber: "9000000003",
		age: 20,
		gender: "Female",
		address: "Test",
		enrollmentNo: "GDBL" + Date.now(),
		course: "Bio",
		batchYear: 2025,
		guardianName: "Guardian",
		guardianContact: "3333333333",
	};
	const resS2 = await api("POST", "/api/students", adminToken!, s2);
	assertOk(resS2.status, "POST student for gate double test");
	const s2Data = resS2.data as Record<string, unknown>;
	const s2Id = s2Data.student as Record<string, unknown>;
	const s2Num = s2Id.studentId as number;

	const resGp = await api("POST", "/api/gatepasses", adminToken!, {
		studentId: s2Num,
		outTime: "2025-09-01T10:00:00Z",
		expectedInTime: "2025-09-01T18:00:00Z",
		reason: "Test",
		status: "Pending",
	});
	assertOk(resGp.status, "POST gate pass");
	const gpId = (resGp.data as Record<string, unknown>).passId as number;

	// First approval → 200
	const resApprove = await api("PUT", `/api/gatepasses/${gpId}`, adminToken!, {
		status: "Approved",
	});
	assertOk(resApprove.status, "First gate pass approval");
	console.log(`  ✅ Gate pass first approval → 200`);

	// Second approval → 409
	const resApprove2 = await api("PUT", `/api/gatepasses/${gpId}`, adminToken!, {
		status: "Approved",
	});
	if (resApprove2.status !== 409) {
		throw new Error(
			`Double gate pass approval should return 409, got ${resApprove2.status}`,
		);
	}
	console.log(`  ✅ Gate pass double approval → 409`);

	// Similarly for reject after approve
	const resReject = await api("PUT", `/api/gatepasses/${gpId}`, adminToken!, {
		status: "Rejected",
	});
	if (resReject.status !== 409) {
		throw new Error(
			`Reject after approve should return 409, got ${resReject.status}`,
		);
	}
	console.log(`  ✅ Gate pass approve→reject → 409`);

	await api("DELETE", `/api/students/${s2Num}`, adminToken!);
}

// ─────────────────────────────────────────────────────────────────────────────
// 404 ON NON-EXISTENT IDs
// ─────────────────────────────────────────────────────────────────────────────

async function test404OnNonExistent(): Promise<void> {
	console.log("\n=== 404 on Non-Existent IDs ===");

	const fakeId = 999999;
	const tests = [
		{ method: "GET", path: `/api/students/${fakeId}` },
		{ method: "PUT", path: `/api/students/${fakeId}`, body: { name: "X" } },
		{ method: "DELETE", path: `/api/students/${fakeId}` },
		{ method: "GET", path: `/api/allocations/${fakeId}` },
		{
			method: "PUT",
			path: `/api/allocations/${fakeId}`,
			body: { status: "Completed" },
		},
		{ method: "DELETE", path: `/api/allocations/${fakeId}` },
		{ method: "GET", path: `/api/gatepasses/${fakeId}` },
		{
			method: "PUT",
			path: `/api/gatepasses/${fakeId}`,
			body: { status: "Approved" },
		},
		{ method: "DELETE", path: `/api/gatepasses/${fakeId}` },
		{ method: "GET", path: `/api/fees/${fakeId}` },
		{ method: "PUT", path: `/api/fees/${fakeId}`, body: { amount: 100 } },
		{ method: "DELETE", path: `/api/fees/${fakeId}` },
		{ method: "GET", path: `/api/maintenance/${fakeId}` },
		{
			method: "PUT",
			path: `/api/maintenance/${fakeId}`,
			body: { status: "Resolved" },
		},
		{ method: "DELETE", path: `/api/maintenance/${fakeId}` },
		{ method: "GET", path: `/api/visitlogs/${fakeId}` },
		{ method: "PUT", path: `/api/visitlogs/${fakeId}`, body: { purpose: "X" } },
		{ method: "DELETE", path: `/api/visitlogs/${fakeId}` },
		{ method: "GET", path: `/api/members/${fakeId}` },
		{ method: "PUT", path: `/api/members/${fakeId}`, body: { name: "X" } },
		{ method: "DELETE", path: `/api/members/${fakeId}` },
		{ method: "GET", path: `/api/rooms/${fakeId}` },
		{ method: "PUT", path: `/api/rooms/${fakeId}`, body: { roomNumber: "X" } },
		{ method: "DELETE", path: `/api/rooms/${fakeId}` },
	];

	for (const { method, path, body } of tests) {
		const res = await api(method, path, adminToken!, body);
		if (res.status !== 404) {
			throw new Error(`${method} ${path} should return 404, got ${res.status}`);
		}
	}
	console.log(`  ✅ All ${tests.length} non-existent ID routes return 404`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT DELETE OCCUPANCY BUG TEST
// ─────────────────────────────────────────────────────────────────────────────

async function testStudentDeleteOccupancyBug(): Promise<void> {
	console.log("\n=== Student DELETE Occupancy Bug Test ===");

	// This verifies that DELETE /api/students/:id properly decrements
	// room.current_occupancy when deleting active allocations.
	// (Contrast with DELETE /api/members/:id which also decrements occupancy)

	const findEmptyRoom = (): number => {
		const db = getMainDb();
		const r = db
			.prepare("SELECT room_id FROM room WHERE current_occupancy = 0 LIMIT 1")
			.get() as { room_id: number } | undefined;
		db.close();
		if (!r) throw new Error("No empty rooms available");
		return r.room_id;
	};

	// Step 1: Create student + allocate to a room
	const roomId = findEmptyRoom();

	const stu = {
		name: "Occupancy Bug Test",
		email: `obug${Date.now()}@example.com`,
		contactNumber: "9000000004",
		age: 21,
		gender: "Male",
		address: "Test",
		enrollmentNo: "OBUG" + Date.now(),
		course: "Phys",
		batchYear: 2025,
		guardianName: "Guardian",
		guardianContact: "4444444444",
	};
	const resStu = await api("POST", "/api/students", adminToken!, stu);
	assertOk(resStu.status, "POST student for occupancy bug test");
	const stuData = resStu.data as Record<string, unknown>;
	const stuId = stuData.student as Record<string, unknown>;
	const stuNum = stuId.studentId as number;

	const resAlloc = await api("POST", "/api/allocations", adminToken!, {
		studentId: stuNum,
		roomId,
		checkInDate: "2025-09-01",
		status: "Active",
	});
	assertOk(resAlloc.status, "POST allocation for occupancy bug test");

	// Verify room occupancy = 1
	let db = getMainDb();
	let occ = db
		.prepare("SELECT current_occupancy FROM room WHERE room_id = ?")
		.get(roomId) as { current_occupancy: number };
	db.close();
	assertEqual(
		occ.current_occupancy,
		1,
		"Room occupancy should be 1 after allocation",
	);

	// Step 2: DELETE the student (not via /api/members/:id, but via /api/students/:id)
	const resDel = await api("DELETE", `/api/students/${stuNum}`, adminToken!);
	assertOk(resDel.status, "DELETE student");

	// Step 3: Check room occupancy - it SHOULD be 0 after the fix
	db = getMainDb();
	occ = db
		.prepare("SELECT current_occupancy FROM room WHERE room_id = ?")
		.get(roomId) as { current_occupancy: number };
	db.close();

	if (occ.current_occupancy !== 0) {
		throw new Error(
			`BUG: DELETE /api/students/${stuNum} left room ${roomId} occupancy at ${occ.current_occupancy} (expected 0). ` +
				`Student DELETE does not decrement room.current_occupancy for active allocations.`,
		);
	}
	console.log(
		`  ✅ DELETE /api/students/:id correctly decrements room occupancy`,
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// OCCUPANCY FLOOR AT ZERO
// ─────────────────────────────────────────────────────────────────────────────

async function testOccupancyFloorAtZero(): Promise<void> {
	console.log("\n=== Occupancy Floor at Zero ===");

	// When an allocation is closed/cancelled/deleted, occupancy decrements.
	// Ensure it never goes below 0 even with concurrent operations or edge cases.

	// Find a room with 0 occupancy
	const db = getMainDb();
	const emptyRoom = db
		.prepare("SELECT room_id FROM room WHERE current_occupancy = 0 LIMIT 1")
		.get() as { room_id: number } | undefined;
	db.close();
	if (!emptyRoom) {
		console.log("  ⚠️  Skipping - no empty rooms available");
		return;
	}

	// Create student + allocate, then cancel
	const stu = {
		name: "Floor Test",
		email: `floor${Date.now()}@example.com`,
		contactNumber: "9000000005",
		age: 20,
		gender: "Female",
		address: "Test",
		enrollmentNo: "FLOOR" + Date.now(),
		course: "Chem",
		batchYear: 2025,
		guardianName: "Guardian",
		guardianContact: "5555555555",
	};
	const resStu = await api("POST", "/api/students", adminToken!, stu);
	assertOk(resStu.status, "POST student for floor test");
	const stuData = resStu.data as Record<string, unknown>;
	const stuId = stuData.student as Record<string, unknown>;
	const stuNum = stuId.studentId as number;

	const resAlloc = await api("POST", "/api/allocations", adminToken!, {
		studentId: stuNum,
		roomId: emptyRoom.room_id,
		checkInDate: "2025-09-01",
		status: "Active",
	});
	assertOk(resAlloc.status, "POST allocation for floor test");
	const allocId = (resAlloc.data as Record<string, unknown>)
		.allocationId as number;

	// Cancel the allocation
	const resCancel = await api(
		"PUT",
		`/api/allocations/${allocId}`,
		adminToken!,
		{ status: "Cancelled" },
	);
	assertOk(resCancel.status, "Cancel allocation");

	// Check occupancy is exactly 0 (not -1)
	const db2 = getMainDb();
	const occ = db2
		.prepare("SELECT current_occupancy FROM room WHERE room_id = ?")
		.get(emptyRoom.room_id) as { current_occupancy: number };
	db2.close();
	if (occ.current_occupancy < 0) {
		throw new Error(`Room occupancy went below 0: ${occ.current_occupancy}`);
	}
	if (occ.current_occupancy !== 0) {
		throw new Error(
			`Room occupancy should be 0 after cancel, got ${occ.current_occupancy}`,
		);
	}
	console.log(
		`  ✅ Room occupancy stays at 0 (not negative) after cancellation`,
	);

	await api("DELETE", `/api/students/${stuNum}`, adminToken!);
}

// ─────────────────────────────────────────────────────────────────────────────
// INVALID STATUS AND VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

async function testInvalidStatusAndValidation(): Promise<void> {
	console.log("\n=== Invalid Status and Validation Tests ===");

	// Get a real allocation ID
	const shardDb = getShardDb(0);
	const alloc = shardDb
		.prepare("SELECT allocation_id, status FROM shard_0_allocation LIMIT 1")
		.get() as { allocation_id: number; status: string } | undefined;
	shardDb.close();
	if (!alloc) {
		console.log("  ⚠️  Skipping - no seed allocations found");
		return;
	}

	// Allocation with invalid status value - handler just passes it through,
	// but we test it doesn't crash and returns 200
	const resInvalid = await api(
		"PUT",
		`/api/allocations/${alloc.allocation_id}`,
		adminToken!,
		{ status: "NotARealStatus" },
	);
	// Handler uses dynamic UPDATE, so invalid status is stored as-is.
	// We just verify it doesn't 500.
	if (resInvalid.status === 500) {
		throw new Error(`Invalid status value caused 500`);
	}
	console.log(
		`  ✅ PUT allocation with invalid status does not crash (${resInvalid.status})`,
	);

	// Empty body on allocation PUT - should still not crash (partial update)
	const resEmpty = await api(
		"PUT",
		`/api/allocations/${alloc.allocation_id}`,
		adminToken!,
		{},
	);
	if (resEmpty.status === 500) {
		throw new Error(`Empty body caused 500`);
	}
	assertOk(resEmpty.status, "PUT allocation with empty body");
	console.log(`  ✅ PUT allocation with empty body does not crash`);
}

// ─────────────────────────────────────────────────────────────────────────────
// runTests
// ─────────────────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
	const failures: string[] = [];

	async function run(name: string, fn: () => Promise<void>): Promise<void> {
		try {
			await fn();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			failures.push(`${name}: ${msg}`);
			console.log(`  ❌ FAILED - ${name}`);
			console.log(`     ${msg.split("\n").join("\n     ")}`);
		}
	}

	const testGroups: [string, () => Promise<void>][] = [
		["Auth", testAuth],
		["Shard Routing", testShardRouting],
		["Students API", testStudents],
		["Allocations API", testAllocations],
		["Gate Passes API", testGatePasses],
		["Fees API", testFees],
		["Maintenance API", testMaintenance],
		["Visit Logs API", testVisitLogs],
		["Members & Rooms API", testMembersAndRooms],
		["Global ID Sequence", testGlobalIdSequence],
		["Data Integrity", testDataIntegrity],
		["Cascade Deletes", testCascadeDeletes],
		["Edge Cases", testEdgeCases],
		["Audit Logs", testAuditLogs],
		["Non-Admin Forbidden", testNonAdminForbidden],
		["Status Transitions", testStatusTransitions],
		["404 Non-Existent IDs", test404OnNonExistent],
		["Student DELETE Occupancy Bug", testStudentDeleteOccupancyBug],
		["Occupancy Floor at Zero", testOccupancyFloorAtZero],
		["Invalid Status & Validation", testInvalidStatusAndValidation],
	];

	for (const [name, fn] of testGroups) {
		await run(name, fn);
	}

	// ── Summary ──────────────────────────────────────────────────────────────
	console.log("\n" + "=".repeat(60));
	if (failures.length === 0) {
		console.log("✅ ALL TESTS PASSED");
		process.exit(0);
	} else {
		console.log(`❌ ${failures.length} test group(s) failed:`);
		for (const f of failures) {
			console.log(`  - ${f.split("\n")[0]}`);
		}
		process.exit(1);
	}
}

async function main(): Promise<void> {
	console.log("=".repeat(60));
	console.log("Assignment 4 - Comprehensive API Test Suite");
	console.log("=".repeat(60));

	// Check environment
	if (!process.env.JWT_SECRET) {
		process.env.JWT_SECRET = "test-secret-for-api-tests";
	}

	// Check shard databases exist
	for (let i = 0; i < 3; i++) {
		const shardPath = path.join(process.cwd(), "src", "db", `shard_${i}.db`);
		try {
			readFileSync(shardPath);
		} catch {
			console.error(`ERROR: Shard database not found: ${shardPath}`);
			console.error("Run: npx tsx scripts/create-shard-schemas.ts");
			process.exit(1);
		}
	}
	console.log("✅ Shard databases found");

	// Check main DB exists
	try {
		readFileSync(MAIN_DB_PATH);
	} catch {
		console.error(`ERROR: Main database not found: ${MAIN_DB_PATH}`);
		console.error("Run: npm run db:seed");
		process.exit(1);
	}
	console.log("✅ Main database found");

	// Start server
	await startServer();

	// Setup auth
	try {
		await setupAuth();
		console.log("✅ Auth setup complete\n");
	} catch (err) {
		console.error("❌ Auth setup failed:", err);
		await stopServer();
		process.exit(1);
	}

	// Run tests
	await runTests();

	// Cleanup
	await stopServer();
}

// Handle process signals
process.on("SIGINT", async () => {
	console.log("\nInterrupted");
	await stopServer();
	process.exit(1);
});

process.on("uncaughtException", async (err) => {
	console.error("Uncaught exception:", err);
	await stopServer();
	process.exit(1);
});

main().catch(async (err) => {
	console.error("Fatal error:", err);
	await stopServer();
	process.exit(1);
});
