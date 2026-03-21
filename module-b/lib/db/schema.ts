import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const member = sqliteTable("member", {
  memberId: integer("member_id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  contactNumber: text("contact_number").notNull(),
  age: integer("age").notNull(),
  gender: text("gender").$type<"Male" | "Female" | "Other">().notNull(),
  address: text("address"),
  profileImage: text("profile_image"),
  userType: text("user_type")
    .$type<"Student" | "Staff" | "Admin">()
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

export const staff = sqliteTable("staff", {
  staffId: integer("staff_id")
    .primaryKey()
    .references(() => member.memberId),
  designation: text("designation").notNull(),
  shiftStart: text("shift_start").notNull(),
  shiftEnd: text("shift_end").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
});

export const student = sqliteTable("student", {
  studentId: integer("student_id")
    .primaryKey()
    .references(() => member.memberId),
  enrollmentNo: text("enrollment_no").notNull().unique(),
  course: text("course").notNull(),
  batchYear: integer("batch_year").notNull(),
  guardianName: text("guardian_name").notNull(),
  guardianContact: text("guardian_contact").notNull(),
});

export const hostelBlock = sqliteTable("hostel_block", {
  blockId: integer("block_id").primaryKey({ autoIncrement: true }),
  blockName: text("block_name").notNull().unique(),
  type: text("type").$type<"Boys" | "Girls" | "Mixed">().notNull(),
  totalFloors: integer("total_floors").notNull(),
  wardenId: integer("warden_id").references(() => staff.staffId),
});

export const room = sqliteTable("room", {
  roomId: integer("room_id").primaryKey({ autoIncrement: true }),
  blockId: integer("block_id")
    .notNull()
    .references(() => hostelBlock.blockId),
  roomNumber: text("room_number").notNull(),
  floorNumber: integer("floor_number").notNull(),
  capacity: integer("capacity").notNull(),
  currentOccupancy: integer("current_occupancy").default(0),
  type: text("type").$type<"AC" | "Non-AC">().notNull().default("Non-AC"),
  status: text("status")
    .$type<"Available" | "Full" | "Maintenance">()
    .default("Available"),
});

export const allocation = sqliteTable("allocation", {
  allocationId: integer("allocation_id").primaryKey({ autoIncrement: true }),
  studentId: integer("student_id")
    .notNull()
    .references(() => student.studentId),
  roomId: integer("room_id")
    .notNull()
    .references(() => room.roomId),
  checkInDate: text("check_in_date").notNull(),
  checkOutDate: text("check_out_date"),
  status: text("status")
    .$type<"Active" | "Completed" | "Cancelled">()
    .default("Active"),
});

export const gatePass = sqliteTable("gate_pass", {
  passId: integer("pass_id").primaryKey({ autoIncrement: true }),
  studentId: integer("student_id")
    .notNull()
    .references(() => student.studentId),
  outTime: text("out_time").notNull(),
  expectedInTime: text("expected_in_time").notNull(),
  actualInTime: text("actual_in_time"),
  reason: text("reason").notNull(),
  status: text("status")
    .$type<"Pending" | "Approved" | "Rejected" | "Closed">()
    .default("Pending"),
  approverId: integer("approver_id").references(() => staff.staffId),
});

export const visitor = sqliteTable("visitor", {
  visitorId: integer("visitor_id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  contactNumber: text("contact_number").notNull(),
  govtIdProof: text("govt_id_proof"),
  relationToStudent: text("relation_to_student").notNull(),
});

export const visitLog = sqliteTable("visit_log", {
  visitId: integer("visit_id").primaryKey({ autoIncrement: true }),
  visitorId: integer("visitor_id")
    .notNull()
    .references(() => visitor.visitorId),
  studentId: integer("student_id")
    .notNull()
    .references(() => student.studentId),
  checkInTime: text("check_in_time").notNull(),
  checkOutTime: text("check_out_time"),
  purpose: text("purpose"),
});

export const maintenanceRequest = sqliteTable("maintenance_request", {
  requestId: integer("request_id").primaryKey({ autoIncrement: true }),
  roomId: integer("room_id").references(() => room.roomId),
  reportedBy: integer("reported_by")
    .notNull()
    .references(() => member.memberId),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: text("priority")
    .$type<"Low" | "Medium" | "High" | "Emergency">()
    .default("Medium"),
  status: text("status")
    .$type<"Open" | "In_Progress" | "Resolved">()
    .default("Open"),
  reportedDate: text("reported_date").$defaultFn(() =>
    new Date().toISOString(),
  ),
  resolvedDate: text("resolved_date"),
  resolvedBy: integer("resolved_by").references(() => staff.staffId),
});

export const feePayment = sqliteTable("fee_payment", {
  paymentId: integer("payment_id").primaryKey({ autoIncrement: true }),
  studentId: integer("student_id")
    .notNull()
    .references(() => student.studentId),
  amount: real("amount").notNull(),
  paymentDate: text("payment_date").notNull(),
  paymentType: text("payment_type")
    .$type<"Hostel_Fee" | "Mess_Fee" | "Fine" | "Security_Deposit">()
    .notNull(),
  transactionId: text("transaction_id").unique(),
  status: text("status")
    .$type<"Success" | "Failed" | "Pending">()
    .default("Pending"),
});

// users and audit - defined after member since they reference it
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"admin" | "user">().notNull().default("user"),
  memberId: integer("member_id").references(() => member.memberId),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

export const auditLog = sqliteTable("audit_log", {
  logId: integer("log_id").primaryKey({ autoIncrement: true }),
  tableName: text("table_name").notNull(),
  action: text("action")
    .$type<"INSERT" | "UPDATE" | "DELETE">()
    .notNull(),
  recordId: integer("record_id").notNull(),
  performedBy: integer("performed_by")
    .notNull()
    .references(() => users.id),
  timestamp: integer("timestamp", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  details: text("details"), // JSON string of what changed
});
