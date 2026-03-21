import { db } from "./db/index";
import {
  users,
  member,
  staff,
  student,
  hostelBlock,
  room,
  allocation,
  gatePass,
  visitor,
  visitLog,
  maintenanceRequest,
  feePayment,
} from "./db/schema";
import { hashPassword } from "./auth";

export async function seed() {
  console.log("🌱 Seeding database...");

  // ── 1. Auth users ────────────────────────────────────────────────────────────
  const adminHash = await hashPassword("admin123");
  const userHash = await hashPassword("user123");

  await db
    .insert(users)
    .values([
      { username: "admin", passwordHash: adminHash, role: "admin" },
      { username: "testuser", passwordHash: userHash, role: "user" },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Auth users");

  // ── 2. Members ───────────────────────────────────────────────────────────────
  // Staff members first (IDs 1-5), then Students (IDs 6-15), then Admin (ID 16)
  await db
    .insert(member)
    .values([
      // Staff
      {
        memberId: 1,
        name: "Rajesh Kumar",
        email: "rajesh.kumar@hostel.edu",
        contactNumber: "9876543210",
        age: 45,
        gender: "Male",
        address: "Staff Quarters, Block A, Campus",
        userType: "Staff",
      },
      {
        memberId: 2,
        name: "Priya Sharma",
        email: "priya.sharma@hostel.edu",
        contactNumber: "9876543211",
        age: 38,
        gender: "Female",
        address: "Staff Quarters, Block B, Campus",
        userType: "Staff",
      },
      {
        memberId: 3,
        name: "Mohan Das",
        email: "mohan.das@hostel.edu",
        contactNumber: "9876543212",
        age: 52,
        gender: "Male",
        address: "Staff Quarters, Block C, Campus",
        userType: "Staff",
      },
      {
        memberId: 4,
        name: "Sunita Patel",
        email: "sunita.patel@hostel.edu",
        contactNumber: "9876543213",
        age: 41,
        gender: "Female",
        address: "Staff Quarters, Block D, Campus",
        userType: "Staff",
      },
      {
        memberId: 5,
        name: "Vikram Singh",
        email: "vikram.singh@hostel.edu",
        contactNumber: "9876543214",
        age: 35,
        gender: "Male",
        address: "Staff Quarters, Block E, Campus",
        userType: "Staff",
      },
      // Students
      {
        memberId: 6,
        name: "Aarav Mehta",
        email: "aarav.mehta@student.edu",
        contactNumber: "9123456781",
        age: 20,
        gender: "Male",
        address: "12, Sindhi Colony, Ahmedabad",
        userType: "Student",
      },
      {
        memberId: 7,
        name: "Ananya Reddy",
        email: "ananya.reddy@student.edu",
        contactNumber: "9123456782",
        age: 21,
        gender: "Female",
        address: "45, Banjara Hills, Hyderabad",
        userType: "Student",
      },
      {
        memberId: 8,
        name: "Rohan Gupta",
        email: "rohan.gupta@student.edu",
        contactNumber: "9123456783",
        age: 19,
        gender: "Male",
        address: "78, Lajpat Nagar, Delhi",
        userType: "Student",
      },
      {
        memberId: 9,
        name: "Kavya Nair",
        email: "kavya.nair@student.edu",
        contactNumber: "9123456784",
        age: 22,
        gender: "Female",
        address: "23, Palarivattom, Kochi",
        userType: "Student",
      },
      {
        memberId: 10,
        name: "Arjun Tiwari",
        email: "arjun.tiwari@student.edu",
        contactNumber: "9123456785",
        age: 20,
        gender: "Male",
        address: "56, Civil Lines, Allahabad",
        userType: "Student",
      },
      {
        memberId: 11,
        name: "Sneha Joshi",
        email: "sneha.joshi@student.edu",
        contactNumber: "9123456786",
        age: 21,
        gender: "Female",
        address: "89, Shivaji Park, Pune",
        userType: "Student",
      },
      {
        memberId: 12,
        name: "Karan Verma",
        email: "karan.verma@student.edu",
        contactNumber: "9123456787",
        age: 19,
        gender: "Male",
        address: "34, Ashok Nagar, Jaipur",
        userType: "Student",
      },
      {
        memberId: 13,
        name: "Pooja Iyer",
        email: "pooja.iyer@student.edu",
        contactNumber: "9123456788",
        age: 22,
        gender: "Female",
        address: "67, T Nagar, Chennai",
        userType: "Student",
      },
      {
        memberId: 14,
        name: "Rahul Yadav",
        email: "rahul.yadav@student.edu",
        contactNumber: "9123456789",
        age: 20,
        gender: "Male",
        address: "90, Boring Road, Patna",
        userType: "Student",
      },
      {
        memberId: 15,
        name: "Divya Kapoor",
        email: "divya.kapoor@student.edu",
        contactNumber: "9123456790",
        age: 21,
        gender: "Female",
        address: "12, Model Town, Ludhiana",
        userType: "Student",
      },
      // Admin
      {
        memberId: 16,
        name: "Admin User",
        email: "admin@hostel.edu",
        contactNumber: "9000000000",
        age: 40,
        gender: "Male",
        address: "Admin Block, Campus",
        userType: "Admin",
      },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Members");

  // ── 3. Staff ─────────────────────────────────────────────────────────────────
  await db
    .insert(staff)
    .values([
      {
        staffId: 1,
        designation: "Chief Warden",
        shiftStart: "08:00",
        shiftEnd: "17:00",
        isActive: true,
      },
      {
        staffId: 2,
        designation: "Warden (Girls)",
        shiftStart: "07:00",
        shiftEnd: "16:00",
        isActive: true,
      },
      {
        staffId: 3,
        designation: "Security Guard",
        shiftStart: "22:00",
        shiftEnd: "06:00",
        isActive: true,
      },
      {
        staffId: 4,
        designation: "Maintenance Supervisor",
        shiftStart: "09:00",
        shiftEnd: "18:00",
        isActive: true,
      },
      {
        staffId: 5,
        designation: "Gate Keeper",
        shiftStart: "06:00",
        shiftEnd: "14:00",
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Staff");

  // ── 4. Students ──────────────────────────────────────────────────────────────
  await db
    .insert(student)
    .values([
      {
        studentId: 6,
        enrollmentNo: "22CS001",
        course: "B.Tech CSE",
        batchYear: 2022,
        guardianName: "Suresh Mehta",
        guardianContact: "9988776601",
      },
      {
        studentId: 7,
        enrollmentNo: "22EC002",
        course: "B.Tech ECE",
        batchYear: 2022,
        guardianName: "Rama Reddy",
        guardianContact: "9988776602",
      },
      {
        studentId: 8,
        enrollmentNo: "23CS003",
        course: "B.Tech CSE",
        batchYear: 2023,
        guardianName: "Ajay Gupta",
        guardianContact: "9988776603",
      },
      {
        studentId: 9,
        enrollmentNo: "21ME004",
        course: "B.Tech ME",
        batchYear: 2021,
        guardianName: "Rajan Nair",
        guardianContact: "9988776604",
      },
      {
        studentId: 10,
        enrollmentNo: "23CS005",
        course: "B.Tech CSE",
        batchYear: 2023,
        guardianName: "Deepak Tiwari",
        guardianContact: "9988776605",
      },
      {
        studentId: 11,
        enrollmentNo: "22CE006",
        course: "B.Tech CE",
        batchYear: 2022,
        guardianName: "Hemant Joshi",
        guardianContact: "9988776606",
      },
      {
        studentId: 12,
        enrollmentNo: "24CS007",
        course: "B.Tech CSE",
        batchYear: 2024,
        guardianName: "Rakesh Verma",
        guardianContact: "9988776607",
      },
      {
        studentId: 13,
        enrollmentNo: "21EE008",
        course: "B.Tech EE",
        batchYear: 2021,
        guardianName: "Krishnan Iyer",
        guardianContact: "9988776608",
      },
      {
        studentId: 14,
        enrollmentNo: "23ME009",
        course: "B.Tech ME",
        batchYear: 2023,
        guardianName: "Shyam Yadav",
        guardianContact: "9988776609",
      },
      {
        studentId: 15,
        enrollmentNo: "22CS010",
        course: "B.Tech CSE",
        batchYear: 2022,
        guardianName: "Harish Kapoor",
        guardianContact: "9988776610",
      },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Students");

  // ── 5. Hostel Blocks ─────────────────────────────────────────────────────────
  await db
    .insert(hostelBlock)
    .values([
      { blockId: 1, blockName: "Alpha Block", type: "Boys", totalFloors: 4, wardenId: 1 },
      { blockId: 2, blockName: "Beta Block", type: "Boys", totalFloors: 3, wardenId: 1 },
      { blockId: 3, blockName: "Gamma Block", type: "Girls", totalFloors: 4, wardenId: 2 },
      { blockId: 4, blockName: "Delta Block", type: "Girls", totalFloors: 3, wardenId: 2 },
      { blockId: 5, blockName: "Epsilon Block", type: "Mixed", totalFloors: 5, wardenId: 1 },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Hostel Blocks");

  // ── 6. Rooms ─────────────────────────────────────────────────────────────────
  await db
    .insert(room)
    .values([
      // Alpha Block (Boys)
      { roomId: 1, blockId: 1, roomNumber: "A-101", floorNumber: 1, capacity: 2, currentOccupancy: 2, type: "Non-AC", status: "Full" },
      { roomId: 2, blockId: 1, roomNumber: "A-102", floorNumber: 1, capacity: 2, currentOccupancy: 1, type: "Non-AC", status: "Available" },
      { roomId: 3, blockId: 1, roomNumber: "A-201", floorNumber: 2, capacity: 1, currentOccupancy: 1, type: "AC", status: "Full" },
      { roomId: 4, blockId: 1, roomNumber: "A-202", floorNumber: 2, capacity: 2, currentOccupancy: 0, type: "Non-AC", status: "Maintenance" },
      // Beta Block (Boys)
      { roomId: 5, blockId: 2, roomNumber: "B-101", floorNumber: 1, capacity: 3, currentOccupancy: 2, type: "Non-AC", status: "Available" },
      { roomId: 6, blockId: 2, roomNumber: "B-102", floorNumber: 1, capacity: 2, currentOccupancy: 1, type: "AC", status: "Available" },
      // Gamma Block (Girls)
      { roomId: 7, blockId: 3, roomNumber: "G-101", floorNumber: 1, capacity: 2, currentOccupancy: 2, type: "Non-AC", status: "Full" },
      { roomId: 8, blockId: 3, roomNumber: "G-102", floorNumber: 1, capacity: 2, currentOccupancy: 1, type: "AC", status: "Available" },
      { roomId: 9, blockId: 3, roomNumber: "G-201", floorNumber: 2, capacity: 2, currentOccupancy: 0, type: "Non-AC", status: "Available" },
      // Delta Block (Girls)
      { roomId: 10, blockId: 4, roomNumber: "D-101", floorNumber: 1, capacity: 2, currentOccupancy: 1, type: "Non-AC", status: "Available" },
      // Epsilon Block (Mixed)
      { roomId: 11, blockId: 5, roomNumber: "E-101", floorNumber: 1, capacity: 2, currentOccupancy: 1, type: "AC", status: "Available" },
      { roomId: 12, blockId: 5, roomNumber: "E-102", floorNumber: 1, capacity: 2, currentOccupancy: 0, type: "Non-AC", status: "Available" },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Rooms");

  // ── 7. Allocations ───────────────────────────────────────────────────────────
  await db
    .insert(allocation)
    .values([
      { allocationId: 1, studentId: 6, roomId: 1, checkInDate: "2024-07-15", status: "Active" },
      { allocationId: 2, studentId: 8, roomId: 1, checkInDate: "2024-07-15", status: "Active" },
      { allocationId: 3, studentId: 10, roomId: 2, checkInDate: "2024-07-16", status: "Active" },
      { allocationId: 4, studentId: 12, roomId: 3, checkInDate: "2024-07-14", status: "Active" },
      { allocationId: 5, studentId: 14, roomId: 5, checkInDate: "2024-07-17", status: "Active" },
      { allocationId: 6, studentId: 7, roomId: 7, checkInDate: "2024-07-15", status: "Active" },
      { allocationId: 7, studentId: 9, roomId: 7, checkInDate: "2024-07-15", status: "Active" },
      { allocationId: 8, studentId: 11, roomId: 8, checkInDate: "2024-07-16", status: "Active" },
      { allocationId: 9, studentId: 13, roomId: 10, checkInDate: "2024-07-14", status: "Active" },
      { allocationId: 10, studentId: 15, roomId: 11, checkInDate: "2024-07-18", status: "Active" },
      // Completed allocation
      { allocationId: 11, studentId: 6, roomId: 6, checkInDate: "2023-07-10", checkOutDate: "2024-05-20", status: "Completed" },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Allocations");

  // ── 8. Gate Passes ───────────────────────────────────────────────────────────
  await db
    .insert(gatePass)
    .values([
      { passId: 1, studentId: 6, outTime: "2024-10-05 18:00", expectedInTime: "2024-10-06 20:00", actualInTime: "2024-10-06 19:30", reason: "Family event", status: "Closed", approverId: 1 },
      { passId: 2, studentId: 8, outTime: "2024-10-10 17:00", expectedInTime: "2024-10-11 21:00", reason: "Medical appointment", status: "Approved", approverId: 1 },
      { passId: 3, studentId: 10, outTime: "2024-10-12 09:00", expectedInTime: "2024-10-12 21:00", reason: "College fest trip", status: "Approved", approverId: 5 },
      { passId: 4, studentId: 7, outTime: "2024-10-15 10:00", expectedInTime: "2024-10-15 22:00", reason: "Shopping", status: "Pending" },
      { passId: 5, studentId: 9, outTime: "2024-10-16 14:00", expectedInTime: "2024-10-17 20:00", reason: "Home visit", status: "Pending" },
      { passId: 6, studentId: 12, outTime: "2024-10-01 07:00", expectedInTime: "2024-10-01 22:00", actualInTime: "2024-10-01 23:15", reason: "City trip", status: "Closed", approverId: 5 },
      { passId: 7, studentId: 14, outTime: "2024-10-08 16:00", expectedInTime: "2024-10-09 20:00", reason: "Tournament", status: "Approved", approverId: 1 },
      { passId: 8, studentId: 11, outTime: "2024-10-20 10:00", expectedInTime: "2024-10-21 22:00", reason: "Internship interview", status: "Rejected", approverId: 2 },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Gate Passes");

  // ── 9. Visitors ──────────────────────────────────────────────────────────────
  await db
    .insert(visitor)
    .values([
      { visitorId: 1, name: "Suresh Mehta", contactNumber: "9988776601", govtIdProof: "Aadhar-1234-5678", relationToStudent: "Father" },
      { visitorId: 2, name: "Rama Reddy", contactNumber: "9988776602", govtIdProof: "PAN-ABCDE1234F", relationToStudent: "Mother" },
      { visitorId: 3, name: "Neha Gupta", contactNumber: "9988776603", govtIdProof: "Aadhar-2345-6789", relationToStudent: "Sister" },
      { visitorId: 4, name: "Rajan Nair", contactNumber: "9988776604", govtIdProof: "Passport-P1234567", relationToStudent: "Father" },
      { visitorId: 5, name: "Ajay Tiwari", contactNumber: "9988776605", govtIdProof: "Aadhar-3456-7890", relationToStudent: "Uncle" },
      { visitorId: 6, name: "Meena Joshi", contactNumber: "9988776606", govtIdProof: "DL-MH0120231234567", relationToStudent: "Mother" },
      { visitorId: 7, name: "Pradeep Verma", contactNumber: "9988776607", govtIdProof: "Aadhar-4567-8901", relationToStudent: "Father" },
      { visitorId: 8, name: "Lakshmi Iyer", contactNumber: "9988776608", govtIdProof: "Aadhar-5678-9012", relationToStudent: "Mother" },
      { visitorId: 9, name: "Vijay Yadav", contactNumber: "9988776609", govtIdProof: "PAN-FGHIJ5678K", relationToStudent: "Brother" },
      { visitorId: 10, name: "Anita Kapoor", contactNumber: "9988776610", govtIdProof: "Aadhar-6789-0123", relationToStudent: "Mother" },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Visitors");

  // ── 10. Visit Logs ───────────────────────────────────────────────────────────
  await db
    .insert(visitLog)
    .values([
      { visitId: 1, visitorId: 1, studentId: 6, checkInTime: "2024-10-01 10:00", checkOutTime: "2024-10-01 13:00", purpose: "Bringing food items" },
      { visitId: 2, visitorId: 2, studentId: 7, checkInTime: "2024-10-03 11:00", checkOutTime: "2024-10-03 14:30", purpose: "Parent visit" },
      { visitId: 3, visitorId: 3, studentId: 8, checkInTime: "2024-10-05 15:00", checkOutTime: "2024-10-05 17:00", purpose: "Dropping personal items" },
      { visitId: 4, visitorId: 4, studentId: 9, checkInTime: "2024-10-07 09:00", checkOutTime: "2024-10-07 12:00", purpose: "Medical documents" },
      { visitId: 5, visitorId: 5, studentId: 10, checkInTime: "2024-10-09 14:00", purpose: "Casual visit" },
      { visitId: 6, visitorId: 6, studentId: 11, checkInTime: "2024-10-11 10:30", checkOutTime: "2024-10-11 13:30", purpose: "Parent visit" },
      { visitId: 7, visitorId: 7, studentId: 12, checkInTime: "2024-10-13 16:00", checkOutTime: "2024-10-13 18:00", purpose: "Bringing supplies" },
      { visitId: 8, visitorId: 8, studentId: 13, checkInTime: "2024-10-15 11:00", checkOutTime: "2024-10-15 14:00", purpose: "Parent visit" },
      { visitId: 9, visitorId: 9, studentId: 14, checkInTime: "2024-10-17 13:00", purpose: "Personal visit" },
      { visitId: 10, visitorId: 10, studentId: 15, checkInTime: "2024-10-19 10:00", checkOutTime: "2024-10-19 12:30", purpose: "Dropping laptop" },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Visit Logs");

  // ── 11. Maintenance Requests ─────────────────────────────────────────────────
  await db
    .insert(maintenanceRequest)
    .values([
      { requestId: 1, roomId: 4, reportedBy: 6, title: "Broken window latch", description: "The window latch in room A-202 is broken and cannot be locked.", priority: "High", status: "Open" },
      { requestId: 2, roomId: 1, reportedBy: 8, title: "Leaking tap", description: "The tap in the bathroom is continuously dripping.", priority: "Medium", status: "In_Progress", resolvedBy: 4 },
      { requestId: 3, roomId: 7, reportedBy: 7, title: "Ceiling fan not working", description: "The ceiling fan in G-101 stopped working.", priority: "High", status: "Resolved", resolvedDate: "2024-10-05", resolvedBy: 4 },
      { requestId: 4, roomId: 5, reportedBy: 14, title: "Power socket broken", description: "One of the power sockets near the study table is damaged.", priority: "High", status: "Open" },
      { requestId: 5, roomId: 3, reportedBy: 12, title: "AC not cooling", description: "The AC is running but not cooling effectively.", priority: "Medium", status: "In_Progress", resolvedBy: 4 },
      { requestId: 6, roomId: 8, reportedBy: 11, title: "Door lock jammed", description: "The room door lock is jamming and hard to open.", priority: "Emergency", status: "Resolved", resolvedDate: "2024-10-08", resolvedBy: 4 },
      { requestId: 7, roomId: 2, reportedBy: 10, title: "Water heater malfunction", description: "The geyser is not heating water.", priority: "Medium", status: "Open" },
      { requestId: 8, roomId: 10, reportedBy: 13, title: "Bed frame broken", description: "The wooden bed frame has a crack and is unstable.", priority: "High", status: "In_Progress", resolvedBy: 4 },
      { requestId: 9, roomId: 11, reportedBy: 15, title: "Internet cable missing", description: "The ethernet cable port cover is missing.", priority: "Low", status: "Open" },
      { requestId: 10, roomId: 6, reportedBy: 14, title: "Bathroom tile cracked", description: "A bathroom floor tile near the washbasin is cracked and sharp.", priority: "High", status: "Resolved", resolvedDate: "2024-10-12", resolvedBy: 4 },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Maintenance Requests");

  // ── 12. Fee Payments ─────────────────────────────────────────────────────────
  await db
    .insert(feePayment)
    .values([
      { paymentId: 1, studentId: 6, amount: 25000, paymentDate: "2024-07-15", paymentType: "Hostel_Fee", transactionId: "TXN20240715001", status: "Success" },
      { paymentId: 2, studentId: 6, amount: 3000, paymentDate: "2024-07-15", paymentType: "Mess_Fee", transactionId: "TXN20240715002", status: "Success" },
      { paymentId: 3, studentId: 7, amount: 25000, paymentDate: "2024-07-16", paymentType: "Hostel_Fee", transactionId: "TXN20240716001", status: "Success" },
      { paymentId: 4, studentId: 7, amount: 3000, paymentDate: "2024-07-16", paymentType: "Mess_Fee", transactionId: "TXN20240716002", status: "Success" },
      { paymentId: 5, studentId: 8, amount: 25000, paymentDate: "2024-07-15", paymentType: "Hostel_Fee", transactionId: "TXN20240715003", status: "Success" },
      { paymentId: 6, studentId: 9, amount: 5000, paymentDate: "2024-07-14", paymentType: "Security_Deposit", transactionId: "TXN20240714001", status: "Success" },
      { paymentId: 7, studentId: 10, amount: 500, paymentDate: "2024-10-06", paymentType: "Fine", transactionId: "TXN20241006001", status: "Success" },
      { paymentId: 8, studentId: 11, amount: 25000, paymentDate: "2024-07-16", paymentType: "Hostel_Fee", transactionId: "TXN20240716003", status: "Success" },
      { paymentId: 9, studentId: 12, amount: 30000, paymentDate: "2024-07-14", paymentType: "Hostel_Fee", transactionId: "TXN20240714002", status: "Success" },
      { paymentId: 10, studentId: 13, amount: 25000, paymentDate: "2024-07-14", paymentType: "Hostel_Fee", transactionId: "TXN20240714003", status: "Success" },
      { paymentId: 11, studentId: 14, amount: 25000, paymentDate: "2024-07-17", paymentType: "Hostel_Fee", transactionId: "TXN20240717001", status: "Success" },
      { paymentId: 12, studentId: 14, amount: 3000, paymentDate: "2024-07-17", paymentType: "Mess_Fee", transactionId: "TXN20240717002", status: "Success" },
      { paymentId: 13, studentId: 15, amount: 30000, paymentDate: "2024-07-18", paymentType: "Hostel_Fee", transactionId: "TXN20240718001", status: "Success" },
      { paymentId: 14, studentId: 8, amount: 3000, paymentDate: "2024-08-01", paymentType: "Mess_Fee", transactionId: "TXN20240801001", status: "Pending" },
      { paymentId: 15, studentId: 9, amount: 25000, paymentDate: "2024-07-14", paymentType: "Hostel_Fee", transactionId: "TXN20240714004", status: "Success" },
    ])
    .onConflictDoNothing();

  console.log("  ✓ Fee Payments");

  console.log("\n✅ Seeding complete!");
}

seed().then(() => {
  console.log("Seeded");
  process.exit(0);
});
