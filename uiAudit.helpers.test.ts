import { avatarSource, failedMutationMessage, selectedTeacherGroupId, successfulMutationMessage } from "../client/src/lib/uiAudit";
import { describe, expect, it } from "vitest";

describe("واجهة تدقيق التفاعلات", () => {
  it("يستخرج معرّف المجموعة الصحيح من رابط الدروس ويهمل القيم غير الصالحة", () => {
    expect(selectedTeacherGroupId("/portal/attendance?group=42")).toBe(42);
    expect(selectedTeacherGroupId("/portal/attendance?group=0")).toBeUndefined();
    expect(selectedTeacherGroupId("/portal/attendance?group=nope")).toBeUndefined();
    expect(selectedTeacherGroupId("/portal/attendance")).toBeUndefined();
  });

  it("يعرض مصدر الصورة الشخصية الصالح أو يرجع إلى الصورة الافتراضية", () => {
    expect(avatarSource(" /manus-storage/avatar.png ")).toBe("/manus-storage/avatar.png");
    expect(avatarSource("   ")).toBeUndefined();
    expect(avatarSource(null)).toBeUndefined();
  });

  it("يوحد رسائل نجاح وفشل الإجراءات", () => {
    expect(successfulMutationMessage()).toBe("تم تنفيذ الإجراء بنجاح.");
    expect(failedMutationMessage("رفض الخادم الطلب")).toBe("رفض الخادم الطلب");
    expect(failedMutationMessage()).toBe("تعذر تنفيذ الإجراء. حاول مرة أخرى.");
  });
});
