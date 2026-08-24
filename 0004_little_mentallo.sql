CREATE TABLE `assignment_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignmentId` int NOT NULL,
	`studentUserId` int NOT NULL,
	`status` enum('sent','confirmed') NOT NULL DEFAULT 'sent',
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`confirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignment_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `assignment_submissions_assignment_student_unique` UNIQUE(`assignmentId`,`studentUserId`)
);
--> statement-breakpoint
CREATE INDEX `assignment_submissions_assignment_idx` ON `assignment_submissions` (`assignmentId`);--> statement-breakpoint
CREATE INDEX `assignment_submissions_student_idx` ON `assignment_submissions` (`studentUserId`);