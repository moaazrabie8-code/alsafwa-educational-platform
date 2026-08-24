import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type Role = "admin" | "teacher" | "student";

function createContext(role: Role, isActive = true): TrpcContext {
  return {
    user: {
      id: 99,
      openId: `test-${role}`,
      name: "Test User",
      email: "test@example.com",
      loginMethod: "test",
      role,
      isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("role protections", () => {
  it("blocks a student from the administrator dashboard before querying data", async () => {
    const caller = appRouter.createCaller(createContext("student"));
    await expect(caller.admin.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks a disabled administrator from the administrator dashboard before querying data", async () => {
    const caller = appRouter.createCaller(createContext("admin", false));
    await expect(caller.admin.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks a student from teacher-only group queries before querying data", async () => {
    const caller = appRouter.createCaller(createContext("student"));
    await expect(caller.teacher.groups()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks a teacher from student-only assignment queries before querying data", async () => {
    const caller = appRouter.createCaller(createContext("teacher"));
    await expect(caller.student.assignments()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks an administrator from student and teacher profile mutations before storage access", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    await expect(caller.profile.update({ name: "مدير النظام" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.profile.uploadAvatar({ imageData: "data:image/png;base64,aGVsbG8=" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
