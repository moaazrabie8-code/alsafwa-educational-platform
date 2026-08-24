import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { groupStudents, teachingGroups } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure } from "../_core/trpc";

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function requireRole(role: "admin" | "teacher" | "student") {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== role) {
      throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تنفيذ هذا الإجراء." });
    }
    return next({ ctx });
  });
}

export const adminProcedure = requireRole("admin");
export const teacherProcedure = requireRole("teacher");
export const studentProcedure = requireRole("student");

export async function requireTeacherGroup(db: AppDb, groupId: number, teacherUserId: number) {
  const group = await db
    .select()
    .from(teachingGroups)
    .where(and(eq(teachingGroups.id, groupId), eq(teachingGroups.teacherUserId, teacherUserId)))
    .limit(1);

  if (!group[0]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذه المجموعة غير متاحة لهذا المعلّم." });
  }
  return group[0];
}

export async function requireStudentGroup(db: AppDb, groupId: number, studentUserId: number) {
  const membership = await db
    .select({ id: groupStudents.id })
    .from(groupStudents)
    .where(and(eq(groupStudents.groupId, groupId), eq(groupStudents.studentUserId, studentUserId)))
    .limit(1);

  if (!membership[0]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذه المجموعة غير متاحة لهذا الطالب." });
  }
}

export function unavailableDatabaseError() {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر الاتصال بقاعدة البيانات حاليًا." });
}
