import { describe, expect, it } from "vitest";
import { canRenderPreviewDemoRoute, isPreviewDemoEnvironment, isTemporaryPreviewHost } from "../client/src/lib/previewMode";

describe("isTemporaryPreviewHost", () => {
  it("allows only temporary sandbox preview domains", () => {
    expect(isTemporaryPreviewHost("3000-iope0aoyvsarq56clfv02-44ff30c1.us3.manus.computer")).toBe(true);
    expect(isTemporaryPreviewHost("preview.us12.manus.computer")).toBe(true);
  });

  it("rejects published, local, and lookalike domains", () => {
    expect(isTemporaryPreviewHost("alsafwa.manus.space")).toBe(false);
    expect(isTemporaryPreviewHost("localhost")).toBe(false);
    expect(isTemporaryPreviewHost("malicious-manus.computer")).toBe(false);
  });

  it("requires a development build regardless of the local preview host", () => {
    expect(isPreviewDemoEnvironment(true, "preview.us2.manus.computer")).toBe(true);
    expect(isPreviewDemoEnvironment(false, "preview.us2.manus.computer")).toBe(false);
    expect(isPreviewDemoEnvironment(true, "alsafwa.manus.space")).toBe(true);
  });

  it("permits only the approved preview role routes in the preview environment", () => {
    expect(canRenderPreviewDemoRoute("/preview/admin", true, "preview.us2.manus.computer")).toBe(true);
    expect(canRenderPreviewDemoRoute("/preview/teacher", true, "preview.us2.manus.computer")).toBe(true);
    expect(canRenderPreviewDemoRoute("/preview/student", true, "preview.us2.manus.computer")).toBe(true);
    expect(canRenderPreviewDemoRoute("/preview/profile/teacher", true, "preview.us2.manus.computer")).toBe(true);
    expect(canRenderPreviewDemoRoute("/preview/profile/student", true, "preview.us2.manus.computer")).toBe(true);
    expect(canRenderPreviewDemoRoute("/preview/teacher", false, "preview.us2.manus.computer")).toBe(false);
    expect(canRenderPreviewDemoRoute("/preview/not-a-role", true, "preview.us2.manus.computer")).toBe(false);
    expect(canRenderPreviewDemoRoute("/preview/student", true, "alsafwa.manus.space")).toBe(true);
    expect(canRenderPreviewDemoRoute("/preview/student", false, "alsafwa.manus.space")).toBe(false);
  });
});
