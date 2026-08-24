CREATE TABLE `academic_stages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `academic_stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(96) NOT NULL,
	`settingValue` text NOT NULL,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_key_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`teacherUserId` int NOT NULL,
	`lessonId` int,
	`title` varchar(240) NOT NULL,
	`instructions` text NOT NULL,
	`dueAt` timestamp,
	`isPublished` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendanceSessionId` int NOT NULL,
	`studentUserId` int NOT NULL,
	`status` enum('present','absent','late') NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_records_session_student_unique` UNIQUE(`attendanceSessionId`,`studentUserId`)
);
--> statement-breakpoint
CREATE TABLE `attendance_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lessonId` int NOT NULL,
	`groupId` int NOT NULL,
	`teacherUserId` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_sessions_lesson_unique` UNIQUE(`lessonId`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(240) NOT NULL,
	`academicStageId` int,
	`subjectId` int,
	`teacherUserId` int,
	`shortDescription` text NOT NULL,
	`priceEgp` int NOT NULL,
	`scheduleText` text,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exam_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examAttemptId` int NOT NULL,
	`questionId` int NOT NULL,
	`selectedChoiceIndex` int,
	`essayAnswer` text,
	`isCorrect` boolean,
	`reviewedScore` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_answers_attempt_question_unique` UNIQUE(`examAttemptId`,`questionId`)
);
--> statement-breakpoint
CREATE TABLE `exam_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examId` int NOT NULL,
	`studentUserId` int NOT NULL,
	`attemptNumber` int NOT NULL,
	`status` enum('in_progress','submitted','reviewed','expired') NOT NULL DEFAULT 'in_progress',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`submittedAt` timestamp,
	`autoScore` int NOT NULL DEFAULT 0,
	`manualScore` int NOT NULL DEFAULT 0,
	`finalScore` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_attempts_exam_student_number_unique` UNIQUE(`examId`,`studentUserId`,`attemptNumber`)
);
--> statement-breakpoint
CREATE TABLE `exam_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examId` int NOT NULL,
	`questionType` enum('multiple_choice','essay') NOT NULL,
	`prompt` text NOT NULL,
	`choices` json,
	`correctChoiceIndex` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exam_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`subjectId` int NOT NULL,
	`teacherUserId` int NOT NULL,
	`lessonId` int,
	`title` varchar(240) NOT NULL,
	`examType` enum('lesson','unit','comprehensive') NOT NULL,
	`relatedScope` varchar(240),
	`durationMinutes` int NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`allowedAttempts` int NOT NULL DEFAULT 1,
	`status` enum('draft','published','closed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `group_students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`studentUserId` int NOT NULL,
	`enrolledAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_students_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_students_group_student_unique` UNIQUE(`groupId`,`studentUserId`)
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`description` text,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`zoomLink` varchar(2048),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lessons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `student_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`academicStageId` int,
	`guardianPhone` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_profiles_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`academicStageId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`code` varchar(48),
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `subjects_stage_name_unique` UNIQUE(`academicStageId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `teacher_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`telegramLink` varchar(512),
	`bio` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `teacher_profiles_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `teaching_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`academicStageId` int NOT NULL,
	`subjectId` int NOT NULL,
	`teacherUserId` int NOT NULL,
	`scheduleText` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teaching_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','user','teacher','student') NOT NULL DEFAULT 'student';--> statement-breakpoint
UPDATE `users` SET `role` = 'student' WHERE `role` = 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','teacher','student') NOT NULL DEFAULT 'student';--> statement-breakpoint
CREATE INDEX `assignments_group_idx` ON `assignments` (`groupId`);--> statement-breakpoint
CREATE INDEX `assignments_teacher_idx` ON `assignments` (`teacherUserId`);--> statement-breakpoint
CREATE INDEX `attendance_records_student_idx` ON `attendance_records` (`studentUserId`);--> statement-breakpoint
CREATE INDEX `attendance_sessions_group_idx` ON `attendance_sessions` (`groupId`);--> statement-breakpoint
CREATE INDEX `courses_status_idx` ON `courses` (`status`);--> statement-breakpoint
CREATE INDEX `courses_teacher_idx` ON `courses` (`teacherUserId`);--> statement-breakpoint
CREATE INDEX `exam_answers_question_idx` ON `exam_answers` (`questionId`);--> statement-breakpoint
CREATE INDEX `exam_attempts_student_idx` ON `exam_attempts` (`studentUserId`);--> statement-breakpoint
CREATE INDEX `exam_questions_exam_idx` ON `exam_questions` (`examId`);--> statement-breakpoint
CREATE INDEX `exams_group_idx` ON `exams` (`groupId`);--> statement-breakpoint
CREATE INDEX `exams_teacher_idx` ON `exams` (`teacherUserId`);--> statement-breakpoint
CREATE INDEX `exams_window_idx` ON `exams` (`startsAt`,`endsAt`);--> statement-breakpoint
CREATE INDEX `group_students_student_idx` ON `group_students` (`studentUserId`);--> statement-breakpoint
CREATE INDEX `lessons_group_idx` ON `lessons` (`groupId`);--> statement-breakpoint
CREATE INDEX `lessons_starts_at_idx` ON `lessons` (`startsAt`);--> statement-breakpoint
CREATE INDEX `student_profiles_stage_idx` ON `student_profiles` (`academicStageId`);--> statement-breakpoint
CREATE INDEX `subjects_stage_idx` ON `subjects` (`academicStageId`);--> statement-breakpoint
CREATE INDEX `groups_teacher_idx` ON `teaching_groups` (`teacherUserId`);--> statement-breakpoint
CREATE INDEX `groups_subject_idx` ON `teaching_groups` (`subjectId`);--> statement-breakpoint
CREATE INDEX `groups_stage_idx` ON `teaching_groups` (`academicStageId`);
