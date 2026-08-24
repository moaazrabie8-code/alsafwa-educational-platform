import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Identity is owned by the platform authentication flow. Educational access is
 * granted through the role and relationships defined by the tables below.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  avatarUrl: varchar("avatarUrl", { length: 2048 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "teacher", "student"]).default("student").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sessionVersion: int("sessionVersion").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const academicStages = mysqlTable("academic_stages", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const subjects = mysqlTable("subjects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 48 }),
  description: text("description"),
  scheduleText: text("scheduleText"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("subjects_name_unique").on(table.name)]);

export const teacherProfiles = mysqlTable("teacher_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  telegramLink: varchar("telegramLink", { length: 512 }),
  bio: text("bio"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("teacher_profiles_user_unique").on(table.userId)]);

export const studentProfiles = mysqlTable("student_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  academicStageId: int("academicStageId"),
  guardianPhone: varchar("guardianPhone", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("student_profiles_user_unique").on(table.userId),
  index("student_profiles_stage_idx").on(table.academicStageId),
]);

export const teachingGroups = mysqlTable("teaching_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  academicStageId: int("academicStageId").notNull(),
  subjectId: int("subjectId").notNull(),
  teacherUserId: int("teacherUserId"),
  scheduleText: text("scheduleText"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("groups_teacher_idx").on(table.teacherUserId),
  index("groups_subject_idx").on(table.subjectId),
  index("groups_stage_idx").on(table.academicStageId),
]);

export const groupStudents = mysqlTable("group_students", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  studentUserId: int("studentUserId").notNull(),
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("group_students_group_student_unique").on(table.groupId, table.studentUserId),
  index("group_students_student_idx").on(table.studentUserId),
]);

/** A lesson is a single scheduled class and can expose one manually managed Zoom link. */
export const lessons = mysqlTable("lessons", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  zoomLink: varchar("zoomLink", { length: 2048 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("lessons_group_idx").on(table.groupId),
  index("lessons_starts_at_idx").on(table.startsAt),
]);

export const attendanceSessions = mysqlTable("attendance_sessions", {
  id: int("id").autoincrement().primaryKey(),
  lessonId: int("lessonId").notNull(),
  groupId: int("groupId").notNull(),
  teacherUserId: int("teacherUserId").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("attendance_sessions_lesson_unique").on(table.lessonId),
  index("attendance_sessions_group_idx").on(table.groupId),
]);

export const attendanceRecords = mysqlTable("attendance_records", {
  id: int("id").autoincrement().primaryKey(),
  attendanceSessionId: int("attendanceSessionId").notNull(),
  studentUserId: int("studentUserId").notNull(),
  status: mysqlEnum("status", ["present", "absent", "late"]).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("attendance_records_session_student_unique").on(table.attendanceSessionId, table.studentUserId),
  index("attendance_records_student_idx").on(table.studentUserId),
]);

/** Assignments contain instructions only; file uploads are intentionally not modelled. */
export const assignments = mysqlTable("assignments", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  teacherUserId: int("teacherUserId").notNull(),
  lessonId: int("lessonId"),
  title: varchar("title", { length: 240 }).notNull(),
  instructions: text("instructions").notNull(),
  dueAt: timestamp("dueAt"),
  isPublished: boolean("isPublished").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("assignments_group_idx").on(table.groupId),
  index("assignments_teacher_idx").on(table.teacherUserId),
]);

/** A submission records the student's Telegram handoff and the teacher's later confirmation. */
export const assignmentSubmissions = mysqlTable("assignment_submissions", {
  id: int("id").autoincrement().primaryKey(),
  assignmentId: int("assignmentId").notNull(),
  studentUserId: int("studentUserId").notNull(),
  status: mysqlEnum("status", ["sent", "confirmed"]).default("sent").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("assignment_submissions_assignment_student_unique").on(table.assignmentId, table.studentUserId),
  index("assignment_submissions_assignment_idx").on(table.assignmentId),
  index("assignment_submissions_student_idx").on(table.studentUserId),
]);

export const exams = mysqlTable("exams", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  subjectId: int("subjectId").notNull(),
  teacherUserId: int("teacherUserId").notNull(),
  lessonId: int("lessonId"),
  title: varchar("title", { length: 240 }).notNull(),
  examType: mysqlEnum("examType", ["lesson", "unit", "comprehensive"]).notNull(),
  relatedScope: varchar("relatedScope", { length: 240 }),
  durationMinutes: int("durationMinutes").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  allowedAttempts: int("allowedAttempts").default(1).notNull(),
  status: mysqlEnum("status", ["draft", "published", "closed"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("exams_group_idx").on(table.groupId),
  index("exams_teacher_idx").on(table.teacherUserId),
  index("exams_window_idx").on(table.startsAt, table.endsAt),
]);

export const examQuestions = mysqlTable("exam_questions", {
  id: int("id").autoincrement().primaryKey(),
  examId: int("examId").notNull(),
  questionType: mysqlEnum("questionType", ["multiple_choice", "essay"]).notNull(),
  prompt: text("prompt").notNull(),
  choices: json("choices").$type<string[] | null>(),
  correctChoiceIndex: int("correctChoiceIndex"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("exam_questions_exam_idx").on(table.examId)]);

export const examAttempts = mysqlTable("exam_attempts", {
  id: int("id").autoincrement().primaryKey(),
  examId: int("examId").notNull(),
  studentUserId: int("studentUserId").notNull(),
  attemptNumber: int("attemptNumber").notNull(),
  status: mysqlEnum("status", ["in_progress", "submitted", "reviewed", "expired"]).default("in_progress").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  submittedAt: timestamp("submittedAt"),
  autoScore: int("autoScore").default(0).notNull(),
  manualScore: int("manualScore").default(0).notNull(),
  finalScore: int("finalScore").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("exam_attempts_exam_student_number_unique").on(table.examId, table.studentUserId, table.attemptNumber),
  index("exam_attempts_student_idx").on(table.studentUserId),
]);

export const examAnswers = mysqlTable("exam_answers", {
  id: int("id").autoincrement().primaryKey(),
  examAttemptId: int("examAttemptId").notNull(),
  questionId: int("questionId").notNull(),
  selectedChoiceIndex: int("selectedChoiceIndex"),
  essayAnswer: text("essayAnswer"),
  isCorrect: boolean("isCorrect"),
  reviewedScore: int("reviewedScore"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("exam_answers_attempt_question_unique").on(table.examAttemptId, table.questionId),
  index("exam_answers_question_idx").on(table.questionId),
]);

/** Public catalogue only; subscription remains an external WhatsApp conversation. */
export const courses = mysqlTable("courses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 240 }).notNull(),
  academicStageId: int("academicStageId"),
  subjectId: int("subjectId"),
  teacherUserId: int("teacherUserId"),
  shortDescription: text("shortDescription").notNull(),
  priceEgp: int("priceEgp").notNull(),
  scheduleText: text("scheduleText"),
  status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("courses_status_idx").on(table.status),
  index("courses_teacher_idx").on(table.teacherUserId),
]);

export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 96 }).notNull(),
  settingValue: text("settingValue").notNull(),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("app_settings_key_unique").on(table.settingKey)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AcademicStage = typeof academicStages.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type TeachingGroup = typeof teachingGroups.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type Exam = typeof exams.$inferSelect;
export type ExamQuestion = typeof examQuestions.$inferSelect;
export type Course = typeof courses.$inferSelect;
