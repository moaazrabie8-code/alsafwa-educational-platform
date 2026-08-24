import { describe, expect, it } from "vitest";
import { answersBelongToExam, calculateAutoScore, canStartNewAttempt, examDeadline, isAttemptExpired } from "./domain/assessmentRules";
import { isCompleteAttendanceBatch, summarizeAttendance } from "./domain/attendanceRules";

describe("assessment rules", () => {
  it("awards one point only for each correct multiple-choice answer", () => {
    const score = calculateAutoScore([
      { id: 1, questionType: "multiple_choice", correctChoiceIndex: 0 },
      { id: 2, questionType: "essay", correctChoiceIndex: null },
      { id: 3, questionType: "multiple_choice", correctChoiceIndex: 1 },
    ], [{ questionId: 1, selectedChoiceIndex: 0 }, { questionId: 3, selectedChoiceIndex: 0 }]);
    expect(score).toBe(1);
  });

  it("uses the earlier of the attempt duration and the exam availability end", () => {
    const startedAt = new Date("2026-08-23T09:00:00.000Z");
    const endsAt = new Date("2026-08-23T10:30:00.000Z");
    expect(examDeadline(endsAt, startedAt, 45).toISOString()).toBe("2026-08-23T09:45:00.000Z");
    expect(isAttemptExpired(endsAt, startedAt, 45, new Date("2026-08-23T09:46:00.000Z"))).toBe(true);
  });

  it("blocks a new attempt once the allowed attempts have been used", () => {
    expect(canStartNewAttempt(0, 1)).toBe(true);
    expect(canStartNewAttempt(1, 1)).toBe(false);
    expect(answersBelongToExam([1, 2], [1, 2])).toBe(true);
    expect(answersBelongToExam([1, 2], [3])).toBe(false);
  });
});

describe("attendance rules", () => {
  it("counts present, absent, and late records separately", () => {
    expect(summarizeAttendance(["present", "late", "present", "absent"])).toEqual({ present: 2, absent: 1, late: 1 });
  });

  it("requires exactly one attendance record for each enrolled student", () => {
    expect(isCompleteAttendanceBatch([10, 20], [10, 20])).toBe(true);
    expect(isCompleteAttendanceBatch([10, 20], [10, 10])).toBe(false);
    expect(isCompleteAttendanceBatch([10, 20], [10])).toBe(false);
  });
});
