import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  academicStages,
  appSettings,
  assignments,
  assignmentSubmissions,
  attendanceRecords,
  attendanceSessions,
  courses,
  exams,
  examAnswers,
  examAttempts,
  examQuestions,
  groupStudents,
  lessons,
  studentProfiles,
  subjects,
  teacherProfiles,
  teachingGroups,
  users,
} from "../../drizzle/schema";
import { requireDb } from "../db";
import { router } from "../_core/trpc";
import { adminProcedure } from "./access";
import { DEFAULT_WHATSAPP_NUMBER } from "./public";

const idInput = z.object({ id: z.number().int().positive() });
const stageInput = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
const subjectInput = z.object({
  academicStageId: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().max(48).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  scheduleText: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
});
const groupInput = z.object({
  name: z.string().trim().min(2).max(160),
  academicStageId: z.number().int().positive(),
  subjectId: z.number().int().positive(),
  teacherUserId: z.number().int().positive().nullable(),
  scheduleText: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
});
const courseInput = z.object({
  name: z.string().trim().min(2).max(240),
  academicStageId: z.number().int().positive().nullable().optional(),
  subjectId: z.number().int().positive().nullable().optional(),
  teacherUserId: z.number().int().positive().nullable().optional(),
  shortDescription: z.string().trim().min(10).max(4000),
  priceEgp: z.number().int().min(0).max(10_000_000),
  scheduleText: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

async function ensureRole(userId: number, role: "teacher" | "student") {
  const db = await requireDb();
  const person = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.role, role))).limit(1);
  if (!person[0]) throw new TRPCError({ code: "BAD_REQUEST", message: `يجب اختيار مستخدم بدور ${role === "teacher" ? "معلّم" : "طالب"}.` });
}

async function ensureSubject(subjectId: number) {
  const db = await requireDb();
  const subject = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  if (!subject[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر مادة دراسية موجودة." });
}

export const adminRouter = router({
  dashboard: adminProcedure.query(async () => {
    const db = await requireDb();
    const [studentCount, teacherCount, groupCount, attendance, recentCourses, whatsappSetting] = await Promise.all([
      db.select({ total: count() }).from(users).where(eq(users.role, "student")),
      db.select({ total: count() }).from(users).where(eq(users.role, "teacher")),
      db.select({ total: count() }).from(teachingGroups),
      db.select({ status: attendanceRecords.status, total: count() }).from(attendanceRecords).groupBy(attendanceRecords.status),
      db.select().from(courses).orderBy(desc(courses.updatedAt)).limit(5),
      db.select().from(appSettings).where(eq(appSettings.settingKey, "whatsappNumber")).limit(1),
    ]);
    return {
      students: Number(studentCount[0]?.total || 0),
      teachers: Number(teacherCount[0]?.total || 0),
      groups: Number(groupCount[0]?.total || 0),
      attendance: {
        present: Number(attendance.find((row) => row.status === "present")?.total || 0),
        absent: Number(attendance.find((row) => row.status === "absent")?.total || 0),
        late: Number(attendance.find((row) => row.status === "late")?.total || 0),
      },
      recentCourses,
      whatsappNumber: whatsappSetting[0]?.settingValue || DEFAULT_WHATSAPP_NUMBER,
    };
  }),

  attendanceHistory: adminProcedure.input(z.object({ page: z.number().int().min(0).default(0), pageSize: z.number().int().min(10).max(100).default(25) })).query(async ({ input }) => {
    const db = await requireDb();
    const rows = await db
      .select({
        status: attendanceRecords.status,
        recordedAt: attendanceRecords.recordedAt,
        studentName: users.name,
        lessonTitle: lessons.title,
        groupName: teachingGroups.name,
      })
      .from(attendanceRecords)
      .innerJoin(attendanceSessions, eq(attendanceRecords.attendanceSessionId, attendanceSessions.id))
      .innerJoin(lessons, eq(attendanceSessions.lessonId, lessons.id))
      .innerJoin(teachingGroups, eq(attendanceSessions.groupId, teachingGroups.id))
      .innerJoin(users, eq(attendanceRecords.studentUserId, users.id))
      .orderBy(desc(attendanceRecords.recordedAt))
      .limit(input.pageSize + 1)
      .offset(input.page * input.pageSize);
    return { items: rows.slice(0, input.pageSize), hasMore: rows.length > input.pageSize };
  }),

  academic: router({
    list: adminProcedure.query(async () => {
      const db = await requireDb();
      const [stages, subjectRows, groupRows, teachers, students] = await Promise.all([
        db.select().from(academicStages).orderBy(academicStages.sortOrder, academicStages.name),
        db.select({
          id: subjects.id,
          name: subjects.name,
          code: subjects.code,
          description: subjects.description,
          scheduleText: subjects.scheduleText,
          isActive: subjects.isActive,
          createdAt: subjects.createdAt,
          updatedAt: subjects.updatedAt,
          academicStageId: sql<number | null>`NULL`.as("academicStageId"),
        }).from(subjects).orderBy(subjects.name),
        db
          .select({
          id: teachingGroups.id,
          academicStageId: teachingGroups.academicStageId,
          subjectId: teachingGroups.subjectId,
          teacherUserId: teachingGroups.teacherUserId,
          name: teachingGroups.name,
            scheduleText: teachingGroups.scheduleText,
            isActive: teachingGroups.isActive,
            stageName: academicStages.name,
            subjectName: subjects.name,
            subjectScheduleText: subjects.scheduleText,
            teacherName: users.name,
          })
          .from(teachingGroups)
          .innerJoin(academicStages, eq(teachingGroups.academicStageId, academicStages.id))
          .innerJoin(subjects, eq(teachingGroups.subjectId, subjects.id))
          .leftJoin(users, eq(teachingGroups.teacherUserId, users.id))
          .orderBy(teachingGroups.name),
        db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.role, "teacher")).orderBy(users.name),
        db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.role, "student")).orderBy(users.name),
      ]);
      return { stages, subjects: subjectRows, groups: groupRows, teachers, students };
    }),
    groupMembers: adminProcedure.query(async () => {
      const db = await requireDb();
      return db
        .select({
          groupId: groupStudents.groupId,
          studentUserId: groupStudents.studentUserId,
          studentName: users.name,
          studentEmail: users.email,
        })
        .from(groupStudents)
        .innerJoin(users, eq(groupStudents.studentUserId, users.id))
        .orderBy(users.name);
    }),
    createStage: adminProcedure.input(stageInput).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.insert(academicStages).values(input);
      return { success: true };
    }),
    updateStage: adminProcedure.input(idInput.merge(stageInput.partial())).mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...changes } = input;
      await db.update(academicStages).set(changes).where(eq(academicStages.id, id));
      return { success: true };
    }),
    deleteStage: adminProcedure.input(idInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const linked = await db.select({ total: count() }).from(teachingGroups).where(eq(teachingGroups.academicStageId, input.id));
      if (Number(linked[0]?.total || 0) > 0) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف مرحلة مرتبطة بمجموعات." });
      await db.delete(academicStages).where(eq(academicStages.id, input.id));
      return { success: true };
    }),
    createSubject: adminProcedure.input(subjectInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const { academicStageId: _legacyStageId, ...subject } = input;
      await db.insert(subjects).values(subject);
      return { success: true };
    }),
    updateSubject: adminProcedure.input(idInput.merge(subjectInput.partial())).mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...changes } = input;
      await db.update(subjects).set(changes).where(eq(subjects.id, id));
      return { success: true };
    }),
    deleteSubject: adminProcedure.input(idInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const [groupLinks, examLinks, courseLinks] = await Promise.all([
        db.select({ total: count() }).from(teachingGroups).where(eq(teachingGroups.subjectId, input.id)),
        db.select({ total: count() }).from(exams).where(eq(exams.subjectId, input.id)),
        db.select({ total: count() }).from(courses).where(eq(courses.subjectId, input.id)),
      ]);
      if (Number(groupLinks[0]?.total || 0) + Number(examLinks[0]?.total || 0) + Number(courseLinks[0]?.total || 0) > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف مادة مستخدمة في مجموعات أو اختبارات أو دورات." });
      }
      await db.delete(subjects).where(eq(subjects.id, input.id));
      return { success: true };
    }),
    createGroup: adminProcedure.input(groupInput).mutation(async ({ input }) => {
      await Promise.all([input.teacherUserId ? ensureRole(input.teacherUserId, "teacher") : Promise.resolve(), ensureSubject(input.subjectId)]);
      const db = await requireDb();
      await db.insert(teachingGroups).values(input);
      return { success: true };
    }),
    updateGroup: adminProcedure.input(idInput.merge(groupInput.partial())).mutation(async ({ input }) => {
      if (input.teacherUserId !== undefined && input.teacherUserId !== null) await ensureRole(input.teacherUserId, "teacher");
      if (input.subjectId) await ensureSubject(input.subjectId);
      const db = await requireDb();
      const { id, ...changes } = input;
      await db.update(teachingGroups).set(changes).where(eq(teachingGroups.id, id));
      return { success: true };
    }),
    deleteGroup: adminProcedure.input(idInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const [members, groupLessons, groupAssignments, groupExams] = await Promise.all([
        db.select({ total: count() }).from(groupStudents).where(eq(groupStudents.groupId, input.id)),
        db.select({ total: count() }).from(lessons).where(eq(lessons.groupId, input.id)),
        db.select({ total: count() }).from(assignments).where(eq(assignments.groupId, input.id)),
        db.select({ total: count() }).from(exams).where(eq(exams.groupId, input.id)),
      ]);
      const blockers = [
        { label: "طلاب", total: Number(members[0]?.total || 0) },
        { label: "دروس", total: Number(groupLessons[0]?.total || 0) },
        { label: "واجبات", total: Number(groupAssignments[0]?.total || 0) },
        { label: "اختبارات", total: Number(groupExams[0]?.total || 0) },
      ].filter((item) => item.total > 0).map((item) => `${item.label}: ${item.total}`);
      if (blockers.length) {
        throw new TRPCError({ code: "CONFLICT", message: `لا يمكن حذف المجموعة لأنها تحتوي على ${blockers.join("، ")}. احذف أو انقل هذه البيانات أولًا.` });
      }
      await db.delete(teachingGroups).where(eq(teachingGroups.id, input.id));
      return { success: true };
    }),
    deleteGroupContent: adminProcedure.input(z.object({ id: z.number().int().positive(), confirmation: z.literal("DELETE_GROUP") })).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.transaction(async (tx) => {
        const [assignmentRows, examRows, sessionRows] = await Promise.all([
          tx.select({ id: assignments.id }).from(assignments).where(eq(assignments.groupId, input.id)),
          tx.select({ id: exams.id }).from(exams).where(eq(exams.groupId, input.id)),
          tx.select({ id: attendanceSessions.id }).from(attendanceSessions).where(eq(attendanceSessions.groupId, input.id)),
        ]);
        const assignmentIds = assignmentRows.map((row) => row.id);
        const examIds = examRows.map((row) => row.id);
        const sessionIds = sessionRows.map((row) => row.id);
        const attemptRows = examIds.length ? await tx.select({ id: examAttempts.id }).from(examAttempts).where(inArray(examAttempts.examId, examIds)) : [];
        const attemptIds = attemptRows.map((row) => row.id);
        if (sessionIds.length) await tx.delete(attendanceRecords).where(inArray(attendanceRecords.attendanceSessionId, sessionIds));
        if (assignmentIds.length) await tx.delete(assignmentSubmissions).where(inArray(assignmentSubmissions.assignmentId, assignmentIds));
        if (attemptIds.length) await tx.delete(examAnswers).where(inArray(examAnswers.examAttemptId, attemptIds));
        if (attemptIds.length) await tx.delete(examAttempts).where(inArray(examAttempts.id, attemptIds));
        if (examIds.length) await tx.delete(examQuestions).where(inArray(examQuestions.examId, examIds));
        if (sessionIds.length) await tx.delete(attendanceSessions).where(inArray(attendanceSessions.id, sessionIds));
        if (assignmentIds.length) await tx.delete(assignments).where(inArray(assignments.id, assignmentIds));
        if (examIds.length) await tx.delete(exams).where(inArray(exams.id, examIds));
        await tx.delete(groupStudents).where(eq(groupStudents.groupId, input.id));
        await tx.delete(lessons).where(eq(lessons.groupId, input.id));
        await tx.delete(teachingGroups).where(eq(teachingGroups.id, input.id));
      });
      return { success: true };
    }),
    enrollStudent: adminProcedure.input(z.object({ groupId: z.number().int().positive(), studentUserId: z.number().int().positive() })).mutation(async ({ input }) => {
      await ensureRole(input.studentUserId, "student");
      const db = await requireDb();
      await db.insert(groupStudents).values(input).onDuplicateKeyUpdate({ set: { studentUserId: input.studentUserId } });
      return { success: true };
    }),
    removeStudent: adminProcedure.input(z.object({ groupId: z.number().int().positive(), studentUserId: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(groupStudents).where(and(eq(groupStudents.groupId, input.groupId), eq(groupStudents.studentUserId, input.studentUserId)));
      return { success: true };
    }),
  }),

  people: router({
    list: adminProcedure.query(async () => {
      const db = await requireDb();
      return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, createdAt: users.createdAt }).from(users).orderBy(users.role, users.name);
    }),
    create: adminProcedure.input(z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320), role: z.enum(["teacher", "student"]) })).mutation(async ({ input }) => {
      const db = await requireDb();
      const email = input.email.toLowerCase();
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "يوجد حساب أو دعوة مسجلة بهذا البريد الإلكتروني." });
      const openId = `pending:${nanoid(18)}`;
      const userId = await db.transaction(async (tx) => {
        const inserted = await tx.insert(users).values({ openId, name: input.name, email, role: input.role, isActive: true, loginMethod: "pending" });
        const createdUserId = Number((inserted as unknown as { insertId: number }).insertId);
        if (input.role === "teacher") await tx.insert(teacherProfiles).values({ userId: createdUserId });
        if (input.role === "student") await tx.insert(studentProfiles).values({ userId: createdUserId });
        return createdUserId;
      });
      return { success: true, userId };
    }),
    update: adminProcedure.input(z.object({ userId: z.number().int().positive(), name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320) })).mutation(async ({ input }) => {
      const db = await requireDb();
      const email = input.email.toLowerCase();
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing[0] && existing[0].id !== input.userId) {
        throw new TRPCError({ code: "CONFLICT", message: "يوجد حساب أو دعوة مسجلة بهذا البريد الإلكتروني." });
      }
      await db.update(users).set({ name: input.name, email }).where(eq(users.id, input.userId));
      return { success: true };
    }),
    setActive: adminProcedure.input(z.object({ userId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id && !input.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تعطيل حساب المدير الحالي." });
      const db = await requireDb();
      await db.update(users).set({ isActive: input.isActive, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, input.userId));
      return { success: true };
    }),
    updateRole: adminProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["teacher", "student", "admin"]) })).mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id && input.role !== "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن إزالة دور المدير من حسابك الحالي." });
      const db = await requireDb();
      await db.transaction(async (tx) => {
        await tx.update(users).set({ role: input.role, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, input.userId));
        if (input.role === "teacher") await tx.insert(teacherProfiles).values({ userId: input.userId }).onDuplicateKeyUpdate({ set: { userId: input.userId } });
        if (input.role === "student") await tx.insert(studentProfiles).values({ userId: input.userId }).onDuplicateKeyUpdate({ set: { userId: input.userId } });
      });
      return { success: true };
    }),
  }),

  courses: router({
    list: adminProcedure.query(async () => {
      const db = await requireDb();
      return db.select().from(courses).orderBy(desc(courses.updatedAt));
    }),
    create: adminProcedure.input(courseInput).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.insert(courses).values(input);
      return { success: true };
    }),
    update: adminProcedure.input(idInput.merge(courseInput.partial())).mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...changes } = input;
      await db.update(courses).set(changes).where(eq(courses.id, id));
      return { success: true };
    }),
    delete: adminProcedure.input(idInput).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(courses).where(eq(courses.id, input.id));
      return { success: true };
    }),
  }),

  settings: router({
    get: adminProcedure.query(async () => {
      const db = await requireDb();
      const setting = await db.select().from(appSettings).where(eq(appSettings.settingKey, "whatsappNumber")).limit(1);
      return { whatsappNumber: setting[0]?.settingValue || DEFAULT_WHATSAPP_NUMBER };
    }),
    updateWhatsApp: adminProcedure.input(z.object({ whatsappNumber: z.string().trim().regex(/^\+?[0-9]{8,16}$/, "أدخل رقم WhatsApp دوليًا صحيحًا.") })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const normalized = input.whatsappNumber.startsWith("+") ? input.whatsappNumber : `+${input.whatsappNumber}`;
      await db.insert(appSettings).values({ settingKey: "whatsappNumber", settingValue: normalized, updatedByUserId: ctx.user.id }).onDuplicateKeyUpdate({ set: { settingValue: normalized, updatedByUserId: ctx.user.id } });
      return { success: true, whatsappNumber: normalized };
    }),
  }),
});
