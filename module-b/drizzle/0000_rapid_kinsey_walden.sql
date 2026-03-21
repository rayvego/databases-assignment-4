CREATE TABLE `allocation` (
	`allocation_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`room_id` integer NOT NULL,
	`check_in_date` text NOT NULL,
	`check_out_date` text,
	`status` text DEFAULT 'Active',
	FOREIGN KEY (`student_id`) REFERENCES `student`(`student_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`room_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`log_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`action` text NOT NULL,
	`record_id` integer NOT NULL,
	`performed_by` integer NOT NULL,
	`timestamp` integer,
	`details` text,
	FOREIGN KEY (`performed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fee_payment` (
	`payment_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`amount` real NOT NULL,
	`payment_date` text NOT NULL,
	`payment_type` text NOT NULL,
	`transaction_id` text,
	`status` text DEFAULT 'Pending',
	FOREIGN KEY (`student_id`) REFERENCES `student`(`student_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fee_payment_transaction_id_unique` ON `fee_payment` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `gate_pass` (
	`pass_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`out_time` text NOT NULL,
	`expected_in_time` text NOT NULL,
	`actual_in_time` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'Pending',
	`approver_id` integer,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`student_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approver_id`) REFERENCES `staff`(`staff_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hostel_block` (
	`block_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_name` text NOT NULL,
	`type` text NOT NULL,
	`total_floors` integer NOT NULL,
	`warden_id` integer,
	FOREIGN KEY (`warden_id`) REFERENCES `staff`(`staff_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hostel_block_block_name_unique` ON `hostel_block` (`block_name`);--> statement-breakpoint
CREATE TABLE `maintenance_request` (
	`request_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer,
	`reported_by` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`priority` text DEFAULT 'Medium',
	`status` text DEFAULT 'Open',
	`reported_date` text,
	`resolved_date` text,
	`resolved_by` integer,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`room_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reported_by`) REFERENCES `member`(`member_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `staff`(`staff_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `member` (
	`member_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`contact_number` text NOT NULL,
	`age` integer NOT NULL,
	`gender` text NOT NULL,
	`address` text,
	`profile_image` text,
	`user_type` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_email_unique` ON `member` (`email`);--> statement-breakpoint
CREATE TABLE `room` (
	`room_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` integer NOT NULL,
	`room_number` text NOT NULL,
	`floor_number` integer NOT NULL,
	`capacity` integer NOT NULL,
	`current_occupancy` integer DEFAULT 0,
	`type` text DEFAULT 'Non-AC' NOT NULL,
	`status` text DEFAULT 'Available',
	FOREIGN KEY (`block_id`) REFERENCES `hostel_block`(`block_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`staff_id` integer PRIMARY KEY NOT NULL,
	`designation` text NOT NULL,
	`shift_start` text NOT NULL,
	`shift_end` text NOT NULL,
	`is_active` integer DEFAULT true,
	FOREIGN KEY (`staff_id`) REFERENCES `member`(`member_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `student` (
	`student_id` integer PRIMARY KEY NOT NULL,
	`enrollment_no` text NOT NULL,
	`course` text NOT NULL,
	`batch_year` integer NOT NULL,
	`guardian_name` text NOT NULL,
	`guardian_contact` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `member`(`member_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_enrollment_no_unique` ON `student` (`enrollment_no`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`member_id` integer,
	`created_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`member_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `visit_log` (
	`visit_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visitor_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`check_in_time` text NOT NULL,
	`check_out_time` text,
	`purpose` text,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitor`(`visitor_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`student_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `visitor` (
	`visitor_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact_number` text NOT NULL,
	`govt_id_proof` text,
	`relation_to_student` text NOT NULL
);
