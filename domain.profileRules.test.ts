import { describe, expect, it } from "vitest";
import { parseAvatarDataUrl } from "./domain/profileRules";

describe("parseAvatarDataUrl", () => {
  it("accepts supported image data URLs and returns bytes for storage", () => {
    const parsed = parseAvatarDataUrl("data:image/png;base64,iVBORw0KGgo=");
    expect(parsed.mimeType).toBe("image/png");
    expect(parsed.extension).toBe("png");
    expect(parsed.bytes.length).toBe(8);
  });

  it("rejects unsupported or malformed image payloads", () => {
    expect(() => parseAvatarDataUrl("data:image/gif;base64,aGVsbG8=")).toThrow();
    expect(() => parseAvatarDataUrl("not-an-image")).toThrow();
    expect(() => parseAvatarDataUrl("data:image/png;base64,aGVsbG8=")).toThrow();
  });
});
