import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireDb: vi.fn() }));

vi.mock("./db", () => ({
  requireDb: mocks.requireDb,
  getDb: vi.fn(),
}));

import { appRouter } from "./routers";

function createContext(role: "admin" | "teacher" | "student", isActive = true): TrpcContext {
  return {
    user: { id: 99, openId: `workflow-${role}`, name: "Workflow User", email: "workflow@example.com", loginMethod: "test", role, isActive, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

function databaseWithSelectResults(results: unknown[], updates: unknown[] = [], inserts: unknown[] = []) {
  const database = {
    select: () => {
      const result = results.shift() ?? [];
      const chain: {
        from: () => typeof chain;
        innerJoin: () => typeof chain;
        where: () => typeof chain;
        orderBy: () => typeof chain;
        limit: () => Promise<unknown>;
        then: Promise<unknown>["then"];
      } = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve(result),
        then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
      };
      return chain;
    },
    update: () => ({
      set: (values: unknown) => {
        updates.push(values);
        return { where: () => Promise.resolve({}) };
      },
    }),
    insert: () => ({
      values: (values: unknown) => {
        inserts.push(values);
        const result = { insertId: inserts.length, onDuplicateKeyUpdate: () => Promise.resolve({}), then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve({ insertId: inserts.length }).then(onFulfilled) };
        return result;
      },
    }),
    delete: () => ({ where: () => Promise.resolve({}) }),
  };
  return {
    ...database,
    transaction: async <T>(callback: (tx: typeof database) => Promise<T>) => callback(database),
  };
}

describe("workflow procedure guards", () => {
  beforeEach(() => mocks.requireDb.mockReset());

  it("rejects a duplicated or incomplete attendance batch before writing records", async () => {
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ id: 7, groupId: 5 }],
      [{ id: 5, teacherUserId: 99 }],
      [{ studentUserId: 10 }, { studentUserId: 20 }],
    ]));
    const caller = appRouter.createCaller(createContext("teacher"));
    await expect(caller.teacher.attendance.save({ lessonId: 7, records: [{ studentUserId: 10, status: "present" }, { studentUserId: 10, status: "late" }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an assignment linked to a lesson from another group before writing", async () => {
    const inserts: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ id: 5, teacherUserId: 99, subjectId: 2 }],
      [],
    ], [], inserts));
    const caller = appRouter.createCaller(createContext("teacher"));
    await expect(caller.teacher.assignments.create({ groupId: 5, lessonId: 44, title: "واجب الجبر", instructions: "حل التدريبات المطلوبة في الدفتر" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(inserts).toHaveLength(0);
  });

  it("rejects an exam whose subject does not match the selected group before writing", async () => {
    const inserts: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ id: 5, teacherUserId: 99, subjectId: 2 }],
    ], [], inserts));
    const caller = appRouter.createCaller(createContext("teacher"));
    await expect(caller.teacher.exams.create({
      groupId: 5,
      subjectId: 3,
      title: "اختبار قصير",
      examType: "lesson",
      durationMinutes: 20,
      startsAt: "2026-08-23T08:00:00.000Z",
      endsAt: "2026-08-23T08:20:00.000Z",
      questions: [{ questionType: "essay", prompt: "اشرح الفكرة الأساسية" }],
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(inserts).toHaveLength(0);
  });

  it("rejects starting an exam when all attempts are already consumed", async () => {
    const now = new Date();
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ exams: { id: 3, status: "published", startsAt: new Date(now.getTime() - 60_000), endsAt: new Date(now.getTime() + 60_000), allowedAttempts: 1 } }],
      [],
      [{ id: 41 }],
    ]));
    const caller = appRouter.createCaller(createContext("student"));
    await expect(caller.student.exams.start({ examId: 3 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("saves answers and the final attempt result together when a student submits an exam", async () => {
    const inserts: unknown[] = [];
    const updates: unknown[] = [];
    const now = new Date();
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ attempt: { id: 77, status: "in_progress", startedAt: now }, exam: { id: 3, endsAt: new Date(now.getTime() + 60 * 60_000), durationMinutes: 60 } }],
      [{ id: 11, questionType: "multiple_choice", correctChoiceIndex: 0, sortOrder: 0 }],
    ], updates, inserts));
    const caller = appRouter.createCaller(createContext("student"));
    await expect(caller.student.exams.submit({ attemptId: 77, answers: [{ questionId: 11, selectedChoiceIndex: 0 }] })).resolves.toEqual({ success: true, score: 1, totalQuestions: 1 });
    expect(inserts).toContainEqual(expect.objectContaining({ examAttemptId: 77, questionId: 11, selectedChoiceIndex: 0, isCorrect: true }));
    expect(updates).toContainEqual(expect.objectContaining({ status: "submitted", autoScore: 1, finalScore: 1 }));
  });

  it("updates the essay score and the attempt result after teacher review", async () => {
    const updates: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ attemptId: 77, examId: 3, questionType: "essay" }],
      [{ id: 3, teacherUserId: 99, status: "published" }],
      [{ reviewedScore: 1, questionType: "essay" }, { reviewedScore: null, questionType: "essay" }],
      [{ autoScore: 2 }],
    ], updates));
    const caller = appRouter.createCaller(createContext("teacher"));
    await expect(caller.teacher.exams.gradeEssay({ answerId: 12, score: 1 })).resolves.toEqual({ success: true });
    expect(updates).toContainEqual(expect.objectContaining({ reviewedScore: 1 }));
    expect(updates).toContainEqual(expect.objectContaining({ manualScore: 1, finalScore: 3, status: "submitted" }));
  });

  it("enrolls a registered student into the selected group from the admin workflow", async () => {
    const inserts: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ id: 22 }],
    ], [], inserts));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.academic.enrollStudent({ groupId: 5, studentUserId: 22 })).resolves.toEqual({ success: true });
    expect(inserts).toContainEqual({ groupId: 5, studentUserId: 22 });
  });

  it("lists group members and removes a student from a group without deleting the student account", async () => {
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ groupId: 5, studentUserId: 22, studentName: "طالب المجموعة", studentEmail: "student@example.com" }],
    ]));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.academic.groupMembers()).resolves.toEqual([
      { groupId: 5, studentUserId: 22, studentName: "طالب المجموعة", studentEmail: "student@example.com" },
    ]);
    await expect(caller.admin.academic.removeStudent({ groupId: 5, studentUserId: 22 })).resolves.toEqual({ success: true });
  });

  it("blocks deleting an academic stage while it still has groups", async () => {
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([[{ total: 1 }]]));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.academic.deleteStage({ id: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows removing a teacher assignment from a group without deleting the group", async () => {
    const updates: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([], updates));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.academic.updateGroup({ id: 5, teacherUserId: null })).resolves.toEqual({ success: true });
    expect(updates).toContainEqual(expect.objectContaining({ teacherUserId: null }));
  });

  it("allows one shared subject to be used in groups from different stages", async () => {
    const inserts: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ id: 31 }], [{ id: 7 }],
      [{ id: 31 }], [{ id: 7 }],
    ], [], inserts));
    const caller = appRouter.createCaller(createContext("admin"));

    await caller.admin.academic.createGroup({ name: "عربي الصف الرابع", academicStageId: 1, subjectId: 7, teacherUserId: 31, isActive: true });
    await caller.admin.academic.createGroup({ name: "عربي الصف السادس", academicStageId: 2, subjectId: 7, teacherUserId: 31, isActive: true });

    expect(inserts).toContainEqual(expect.objectContaining({ subjectId: 7, academicStageId: 1 }));
    expect(inserts).toContainEqual(expect.objectContaining({ subjectId: 7, academicStageId: 2 }));
  });

  it("blocks deleting a group when it has a linked lesson even without enrolled students", async () => {
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ total: 0 }], [{ total: 1 }], [{ total: 0 }], [{ total: 0 }],
    ]));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.academic.deleteGroup({ id: 11 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deletes an empty experimental group and blocks deleting a subject still used by a group", async () => {
    mocks.requireDb.mockResolvedValueOnce(databaseWithSelectResults([
      [{ total: 0 }], [{ total: 0 }], [{ total: 0 }], [{ total: 0 }],
    ]));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.academic.deleteGroup({ id: 12 })).resolves.toEqual({ success: true });

    mocks.requireDb.mockResolvedValueOnce(databaseWithSelectResults([
      [{ total: 1 }], [{ total: 0 }], [{ total: 0 }],
    ]));
    await expect(caller.admin.academic.deleteSubject({ id: 7 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows only the admin workflow to delete a complete group after an explicit confirmation", async () => {
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([[], [], []]));
    const admin = appRouter.createCaller(createContext("admin"));
    await expect(admin.admin.academic.deleteGroupContent({ id: 12, confirmation: "DELETE_GROUP" })).resolves.toEqual({ success: true });
    const teacher = appRouter.createCaller(createContext("teacher"));
    await expect(teacher.admin.academic.deleteGroupContent({ id: 12, confirmation: "DELETE_GROUP" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates a pre-registered teacher and allows the administrator to disable that account", async () => {
    const inserts: unknown[] = [];
    const updates: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([[]], updates, inserts));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.people.create({ name: "معلمة جديدة", email: "teacher@example.com", role: "teacher" })).resolves.toMatchObject({ success: true });
    expect(inserts[0]).toMatchObject({ name: "معلمة جديدة", email: "teacher@example.com", role: "teacher", isActive: true });
    await expect(caller.admin.people.setActive({ userId: 7, isActive: false })).resolves.toEqual({ success: true });
    expect(updates).toContainEqual(expect.objectContaining({ isActive: false, sessionVersion: expect.anything() }));
  });

  it("rejects creating a pre-registered account when the normalized email already exists", async () => {
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([[{ id: 8 }]]));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.people.create({ name: "طالب مكرر", email: "Existing@Example.COM", role: "student" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("updates account details and changes the account role from the admin workflow", async () => {
    const updates: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([], updates));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.people.update({ userId: 7, name: "طالب محدّث", email: "student.updated@example.com" })).resolves.toEqual({ success: true });
    await expect(caller.admin.people.updateRole({ userId: 7, role: "teacher" })).resolves.toEqual({ success: true });
    expect(updates).toContainEqual({ name: "طالب محدّث", email: "student.updated@example.com" });
    expect(updates).toContainEqual(expect.objectContaining({ role: "teacher", sessionVersion: expect.anything() }));
  });

  it("rejects an account update when its email is already assigned to another user", async () => {
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([[{ id: 8 }]]));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.people.update({ userId: 7, name: "طالب محدّث", email: "taken@example.com" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("creates a published course from the administrator workflow", async () => {
    const inserts: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([], [], inserts));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.courses.create({ name: "مراجعة الجبر", shortDescription: "مراجعة مركزة لمهارات الجبر الأساسية", priceEgp: 300, status: "published" })).resolves.toEqual({ success: true });
    expect(inserts).toContainEqual(expect.objectContaining({ name: "مراجعة الجبر", status: "published", priceEgp: 300 }));
  });

  it("returns each student material with the lessons belonging to its group", async () => {
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ id: 5, name: "مجموعة الجبر", scheduleText: "الثلاثاء", subjectId: 2, subjectName: "الرياضيات" }],
      [{ id: 12, groupId: 5, title: "الدرس الأول", startsAt: new Date(), endsAt: null, zoomLink: "https://zoom.us/j/1", isActive: true }],
    ]));
    const caller = appRouter.createCaller(createContext("student"));
    await expect(caller.student.materials()).resolves.toMatchObject([{ id: 5, subjectName: "الرياضيات", lessons: [{ id: 12, title: "الدرس الأول" }] }]);
  });

  it("updates the default subject schedule and the overriding group schedule", async () => {
    const updates: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([], updates));
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.admin.academic.updateSubject({ id: 2, scheduleText: "السبت والثلاثاء 5 مساءً" })).resolves.toEqual({ success: true });
    await expect(caller.admin.academic.updateGroup({ id: 5, scheduleText: "الأحد والأربعاء 6 مساءً" })).resolves.toEqual({ success: true });
    expect(updates).toContainEqual(expect.objectContaining({ scheduleText: "السبت والثلاثاء 5 مساءً" }));
    expect(updates).toContainEqual(expect.objectContaining({ scheduleText: "الأحد والأربعاء 6 مساءً" }));
  });

  it("updates only the signed-in teacher profile and preserves the role-specific fields", async () => {
    const updates: unknown[] = [];
    const inserts: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ id: 99, name: "معلّم محدّث", email: "workflow@example.com", role: "teacher", avatarUrl: null }],
      [{ id: 1, userId: 99, bio: "مدرس رياضيات", telegramLink: "https://t.me/teacher" }],
    ], updates, inserts));
    const caller = appRouter.createCaller(createContext("teacher"));
    await expect(caller.profile.update({ name: "معلّم محدّث", bio: "مدرس رياضيات", telegramLink: "https://t.me/teacher" })).resolves.toMatchObject({ name: "معلّم محدّث", role: "teacher" });
    expect(updates).toContainEqual({ name: "معلّم محدّث" });
    expect(inserts).toContainEqual({ userId: 99, bio: "مدرس رياضيات", telegramLink: "https://t.me/teacher" });
  });

  it("records that the student sent an assignment through Telegram", async () => {
    const inserts: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ id: 8 }],
      [],
    ], [], inserts));
    const caller = appRouter.createCaller(createContext("student"));
    await expect(caller.student.markAssignmentSent({ assignmentId: 8 })).resolves.toEqual({ success: true, status: "sent" });
    expect(inserts).toContainEqual(expect.objectContaining({ assignmentId: 8, studentUserId: 99, status: "sent" }));
  });

  it("allows the responsible teacher to confirm a student submission", async () => {
    const updates: unknown[] = [];
    mocks.requireDb.mockResolvedValue(databaseWithSelectResults([
      [{ id: 8, groupId: 5, teacherUserId: 99 }],
      [{ id: 5, teacherUserId: 99 }],
      [{ id: 3 }],
      [{ id: 41, assignmentId: 8, studentUserId: 10, status: "sent" }],
    ], updates));
    const caller = appRouter.createCaller(createContext("teacher"));
    await expect(caller.teacher.assignments.confirmSubmission({ assignmentId: 8, studentUserId: 10 })).resolves.toEqual({ success: true });
    expect(updates).toContainEqual(expect.objectContaining({ status: "confirmed" }));
  });

  it("blocks inactive accounts before protected procedures access data", async () => {
    const caller = appRouter.createCaller(createContext("teacher", false));
    await expect(caller.teacher.groups()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
