import { TRPCError } from "@trpc/server";

const MAX_AVATAR_BYTES = 1_500_000;
const MIME_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function hasExpectedImageSignature(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

export function parseAvatarDataUrl(dataUrl: string): { bytes: Buffer; mimeType: string; extension: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "الصورة يجب أن تكون JPG أو PNG أو WebP." });
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "حجم الصورة يجب ألا يتجاوز 1.5 ميجابايت." });
  if (!hasExpectedImageSignature(bytes, match[1])) throw new TRPCError({ code: "BAD_REQUEST", message: "محتوى الصورة لا يطابق نوعها المعلن." });
  return { bytes, mimeType: match[1], extension: MIME_EXTENSIONS[match[1]] };
}
