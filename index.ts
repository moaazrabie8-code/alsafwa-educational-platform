import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function requestIp(req: express.Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwarded = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined;
  return firstForwarded || req.ip || req.socket.remoteAddress || "unknown";
}

function createRateLimit(options: { windowMs: number; max: number; scope: string }) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const key = `${options.scope}:${requestIp(req)}`;
    const current = rateBuckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : current;
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > options.max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: "too_many_requests", message: "تم تجاوز الحد المؤقت للطلبات. أعد المحاولة لاحقًا." });
      return;
    }
    if (rateBuckets.size > 10_000) {
      rateBuckets.forEach((entry, bucketKey) => {
        if (entry.resetAt <= now) rateBuckets.delete(bucketKey);
      });
    }
    next();
  };
}

function requireSameOriginForMutation(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (typeof forwardedHost === "string" ? forwardedHost.split(",")[0] : undefined) || req.headers.host;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = (typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : undefined) || req.protocol;
  const expectedOrigin = host ? `${proto || "https"}://${host.trim()}` : null;
  if (typeof origin !== "string" || !expectedOrigin || origin !== expectedOrigin) {
    res.status(403).json({ error: "invalid_origin", message: "تم رفض طلب من مصدر غير موثوق." });
    return;
  }
  next();
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    // X-Frame-Options cannot express an allow-list. CSP therefore permits only the
    // trusted Manus workspace to embed a preview while rejecting all other frames.
    res.setHeader("Content-Security-Policy", "base-uri 'self'; frame-ancestors 'self' https://manus.im https://*.manus.im; object-src 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
    if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=15552000");
    next();
  });
  // الصور الشخصية تقبل حتى 1.5MB قبل ترميز Base64؛ حد 3MB يكفي للطلب مع منع الاستهلاك غير المبرر.
  app.use(express.json({ limit: "3mb" }));
  app.use(express.urlencoded({ limit: "3mb", extended: true, parameterLimit: 100 }));
  registerStorageProxy(app);
  app.use("/api/oauth/callback", createRateLimit({ scope: "oauth", windowMs: 15 * 60_000, max: 20 }));
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createRateLimit({ scope: "trpc", windowMs: 60_000, max: 120 }),
    requireSameOriginForMutation,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
