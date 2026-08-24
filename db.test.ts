import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./db";

describe("normalizeEmail", () => {
  it("normalizes an OAuth email before it is used to find a pending account", () => {
    expect(normalizeEmail("  Student.Pending@Example.COM ")).toBe("student.pending@example.com");
  });

  it("preserves an absent email as absent", () => {
    expect(normalizeEmail(undefined)).toBeUndefined();
    expect(normalizeEmail(null)).toBeUndefined();
  });
});
