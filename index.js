// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var SESSION_DURATION_MS = 1e3 * 60 * 60 * 12;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { and, eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  avatarUrl: varchar("avatarUrl", { length: 2048 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "teacher", "student"]).default("student").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sessionVersion: int("sessionVersion").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);
var academicStages = mysqlTable("academic_stages", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var subjects = mysqlTable("subjects", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 48 }),
  description: text("description"),
  scheduleText: text("scheduleText"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [uniqueIndex("subjects_name_unique").on(table.name)]);
var teacherProfiles = mysqlTable("teacher_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  telegramLink: varchar("telegramLink", { length: 512 }),
  bio: text("bio"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [uniqueIndex("teacher_profiles_user_unique").on(table.userId)]);
var studentProfiles = mysqlTable("student_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  academicStageId: int("academicStageId"),
  guardianPhone: varchar("guardianPhone", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  uniqueIndex("student_profiles_user_unique").on(table.userId),
  index("student_profiles_stage_idx").on(table.academicStageId)
]);
var teachingGroups = mysqlTable("teaching_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  academicStageId: int("academicStageId").notNull(),
  subjectId: int("subjectId").notNull(),
  teacherUserId: int("teacherUserId"),
  scheduleText: text("scheduleText"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  index("groups_teacher_idx").on(table.teacherUserId),
  index("groups_subject_idx").on(table.subjectId),
  index("groups_stage_idx").on(table.academicStageId)
]);
var groupStudents = mysqlTable("group_students", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  studentUserId: int("studentUserId").notNull(),
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull()
}, (table) => [
  uniqueIndex("group_students_group_student_unique").on(table.groupId, table.studentUserId),
  index("group_students_student_idx").on(table.studentUserId)
]);
var lessons = mysqlTable("lessons", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  zoomLink: varchar("zoomLink", { length: 2048 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  index("lessons_group_idx").on(table.groupId),
  index("lessons_starts_at_idx").on(table.startsAt)
]);
var attendanceSessions = mysqlTable("attendance_sessions", {
  id: int("id").autoincrement().primaryKey(),
  lessonId: int("lessonId").notNull(),
  groupId: int("groupId").notNull(),
  teacherUserId: int("teacherUserId").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull()
}, (table) => [
  uniqueIndex("attendance_sessions_lesson_unique").on(table.lessonId),
  index("attendance_sessions_group_idx").on(table.groupId)
]);
var attendanceRecords = mysqlTable("attendance_records", {
  id: int("id").autoincrement().primaryKey(),
  attendanceSessionId: int("attendanceSessionId").notNull(),
  studentUserId: int("studentUserId").notNull(),
  status: mysqlEnum("status", ["present", "absent", "late"]).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull()
}, (table) => [
  uniqueIndex("attendance_records_session_student_unique").on(table.attendanceSessionId, table.studentUserId),
  index("attendance_records_student_idx").on(table.studentUserId)
]);
var assignments = mysqlTable("assignments", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  teacherUserId: int("teacherUserId").notNull(),
  lessonId: int("lessonId"),
  title: varchar("title", { length: 240 }).notNull(),
  instructions: text("instructions").notNull(),
  dueAt: timestamp("dueAt"),
  isPublished: boolean("isPublished").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  index("assignments_group_idx").on(table.groupId),
  index("assignments_teacher_idx").on(table.teacherUserId)
]);
var assignmentSubmissions = mysqlTable("assignment_submissions", {
  id: int("id").autoincrement().primaryKey(),
  assignmentId: int("assignmentId").notNull(),
  studentUserId: int("studentUserId").notNull(),
  status: mysqlEnum("status", ["sent", "confirmed"]).default("sent").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  uniqueIndex("assignment_submissions_assignment_student_unique").on(table.assignmentId, table.studentUserId),
  index("assignment_submissions_assignment_idx").on(table.assignmentId),
  index("assignment_submissions_student_idx").on(table.studentUserId)
]);
var exams = mysqlTable("exams", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  subjectId: int("subjectId").notNull(),
  teacherUserId: int("teacherUserId").notNull(),
  lessonId: int("lessonId"),
  title: varchar("title", { length: 240 }).notNull(),
  examType: mysqlEnum("examType", ["lesson", "unit", "comprehensive"]).notNull(),
  relatedScope: varchar("relatedScope", { length: 240 }),
  durationMinutes: int("durationMinutes").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  allowedAttempts: int("allowedAttempts").default(1).notNull(),
  status: mysqlEnum("status", ["draft", "published", "closed"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  index("exams_group_idx").on(table.groupId),
  index("exams_teacher_idx").on(table.teacherUserId),
  index("exams_window_idx").on(table.startsAt, table.endsAt)
]);
var examQuestions = mysqlTable("exam_questions", {
  id: int("id").autoincrement().primaryKey(),
  examId: int("examId").notNull(),
  questionType: mysqlEnum("questionType", ["multiple_choice", "essay"]).notNull(),
  prompt: text("prompt").notNull(),
  choices: json("choices").$type(),
  correctChoiceIndex: int("correctChoiceIndex"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [index("exam_questions_exam_idx").on(table.examId)]);
var examAttempts = mysqlTable("exam_attempts", {
  id: int("id").autoincrement().primaryKey(),
  examId: int("examId").notNull(),
  studentUserId: int("studentUserId").notNull(),
  attemptNumber: int("attemptNumber").notNull(),
  status: mysqlEnum("status", ["in_progress", "submitted", "reviewed", "expired"]).default("in_progress").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  submittedAt: timestamp("submittedAt"),
  autoScore: int("autoScore").default(0).notNull(),
  manualScore: int("manualScore").default(0).notNull(),
  finalScore: int("finalScore").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  uniqueIndex("exam_attempts_exam_student_number_unique").on(table.examId, table.studentUserId, table.attemptNumber),
  index("exam_attempts_student_idx").on(table.studentUserId)
]);
var examAnswers = mysqlTable("exam_answers", {
  id: int("id").autoincrement().primaryKey(),
  examAttemptId: int("examAttemptId").notNull(),
  questionId: int("questionId").notNull(),
  selectedChoiceIndex: int("selectedChoiceIndex"),
  essayAnswer: text("essayAnswer"),
  isCorrect: boolean("isCorrect"),
  reviewedScore: int("reviewedScore"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  uniqueIndex("exam_answers_attempt_question_unique").on(table.examAttemptId, table.questionId),
  index("exam_answers_question_idx").on(table.questionId)
]);
var courses = mysqlTable("courses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 240 }).notNull(),
  academicStageId: int("academicStageId"),
  subjectId: int("subjectId"),
  teacherUserId: int("teacherUserId"),
  shortDescription: text("shortDescription").notNull(),
  priceEgp: int("priceEgp").notNull(),
  scheduleText: text("scheduleText"),
  status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [
  index("courses_status_idx").on(table.status),
  index("courses_teacher_idx").on(table.teacherUserId)
]);
var appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 96 }).notNull(),
  settingValue: text("settingValue").notNull(),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => [uniqueIndex("app_settings_key_unique").on(table.settingKey)]);

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}
function normalizeEmail(email) {
  return email?.trim().toLowerCase();
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const normalizedEmail = normalizeEmail(user.email);
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    if (normalizedEmail) {
      const pending = await db.select().from(users).where(and(eq(users.email, normalizedEmail), like(users.openId, "pending:%"))).limit(1);
      if (pending[0]) {
        await db.update(users).set({
          openId: user.openId,
          name: user.name ?? pending[0].name,
          email: normalizedEmail,
          loginMethod: user.loginMethod ?? pending[0].loginMethod,
          lastSignedIn: user.lastSignedIn ?? /* @__PURE__ */ new Date()
        }).where(eq(users.id, pending[0].id));
        return;
      }
    }
    const values = { openId: user.openId };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    textFields.forEach((field) => {
      const value = field === "email" ? normalizedEmail : user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    });
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (user.isActive !== void 0) {
      values.isActive = user.isActive;
      updateSet.isActive = user.isActive;
    }
    if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
        sessionVersion: options.sessionVersion ?? 0
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? SESSION_DURATION_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      sessionVersion: payload.sessionVersion
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name, sessionVersion } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || typeof name !== "string" || typeof sessionVersion !== "number" || !Number.isInteger(sessionVersion) || sessionVersion < 0) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name,
        sessionVersion
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken && process.env.NODE_ENV === "development") {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    if (user.sessionVersion !== session.sessionVersion) {
      throw ForbiddenError("Session has been revoked");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "student",
    isActive: true,
    sessionVersion: 0,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const storedUser = await getUserByOpenId(userInfo.openId);
      if (!storedUser) throw new Error("User synchronization failed");
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        // OAuth providers can return an empty display name for some accounts.
        // The database record preserves the administrator-provided name when
        // a pre-registered account is first bound to a real openId.
        name: storedUser.name || userInfo.name || storedUser.email || "\u0645\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0645\u0646\u0635\u0629",
        expiresInMs: SESSION_DURATION_MS,
        sessionVersion: storedUser.sessionVersion
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_DURATION_MS });
      res.redirect(302, "/");
    } catch (error) {
      const redirectUri = decodeOAuthState(state).redirectUri;
      console.error("[OAuth] Callback failed", { redirectUri, error });
      res.redirect(302, "/?login=retry");
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/{*key}", async (req, res) => {
    const rawKey = req.params.key;
    const key = Array.isArray(rawKey) ? rawKey.join("/") : rawKey;
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (!ctx.user.isActive) {
    throw new TRPCError2({ code: "FORBIDDEN", message: "\u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0639\u0637\u0651\u0644. \u0631\u0627\u062C\u0639 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0635\u0629." });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = protectedProcedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers/admin.ts
import { TRPCError as TRPCError4 } from "@trpc/server";
import { and as and3, count, desc as desc2, eq as eq4, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z as z3 } from "zod";

// server/routers/access.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { and as and2, eq as eq2 } from "drizzle-orm";
function requireRole(role) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== role) {
      throw new TRPCError3({ code: "FORBIDDEN", message: "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621." });
    }
    return next({ ctx });
  });
}
var adminProcedure2 = requireRole("admin");
var teacherProcedure = requireRole("teacher");
var studentProcedure = requireRole("student");
async function requireTeacherGroup(db, groupId, teacherUserId) {
  const group = await db.select().from(teachingGroups).where(and2(eq2(teachingGroups.id, groupId), eq2(teachingGroups.teacherUserId, teacherUserId))).limit(1);
  if (!group[0]) {
    throw new TRPCError3({ code: "FORBIDDEN", message: "\u0647\u0630\u0647 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0639\u0644\u0651\u0645." });
  }
  return group[0];
}

// server/routers/public.ts
import { desc, eq as eq3 } from "drizzle-orm";
import { z as z2 } from "zod";
var DEFAULT_WHATSAPP_NUMBER = "+201013593076";
var publicRouter = router({
  courseCatalog: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { courses: [], whatsappNumber: DEFAULT_WHATSAPP_NUMBER };
    const [courseRows, whatsappSetting] = await Promise.all([
      db.select({
        id: courses.id,
        name: courses.name,
        shortDescription: courses.shortDescription,
        priceEgp: courses.priceEgp,
        scheduleText: courses.scheduleText,
        academicStageName: academicStages.name,
        subjectName: subjects.name,
        teacherName: users.name
      }).from(courses).leftJoin(academicStages, eq3(courses.academicStageId, academicStages.id)).leftJoin(subjects, eq3(courses.subjectId, subjects.id)).leftJoin(users, eq3(courses.teacherUserId, users.id)).where(eq3(courses.status, "published")).orderBy(desc(courses.createdAt)),
      db.select().from(appSettings).where(eq3(appSettings.settingKey, "whatsappNumber")).limit(1)
    ]);
    return {
      courses: courseRows,
      whatsappNumber: whatsappSetting[0]?.settingValue || DEFAULT_WHATSAPP_NUMBER
    };
  }),
  subscribeLink: publicProcedure.input(z2.object({ courseName: z2.string().trim().min(1).max(240) })).query(async ({ input }) => {
    const db = await getDb();
    const setting = db ? await db.select().from(appSettings).where(eq3(appSettings.settingKey, "whatsappNumber")).limit(1) : [];
    const rawNumber = setting[0]?.settingValue || DEFAULT_WHATSAPP_NUMBER;
    const phone = rawNumber.replace(/[^0-9]/g, "");
    const message = `\u0645\u0631\u062D\u0628\u064B\u0627\u060C \u0623\u0648\u062F \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0641\u064A \u062F\u0648\u0631\u0629 ${input.courseName}.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  })
});

// server/routers/admin.ts
var idInput = z3.object({ id: z3.number().int().positive() });
var stageInput = z3.object({
  name: z3.string().trim().min(2).max(160),
  description: z3.string().trim().max(2e3).nullable().optional(),
  sortOrder: z3.number().int().min(0).max(9999).default(0),
  isActive: z3.boolean().default(true)
});
var subjectInput = z3.object({
  academicStageId: z3.number().int().positive().optional(),
  name: z3.string().trim().min(2).max(160),
  code: z3.string().trim().max(48).nullable().optional(),
  description: z3.string().trim().max(2e3).nullable().optional(),
  scheduleText: z3.string().trim().max(2e3).nullable().optional(),
  isActive: z3.boolean().default(true)
});
var groupInput = z3.object({
  name: z3.string().trim().min(2).max(160),
  academicStageId: z3.number().int().positive(),
  subjectId: z3.number().int().positive(),
  teacherUserId: z3.number().int().positive().nullable(),
  scheduleText: z3.string().trim().max(2e3).nullable().optional(),
  isActive: z3.boolean().default(true)
});
var courseInput = z3.object({
  name: z3.string().trim().min(2).max(240),
  academicStageId: z3.number().int().positive().nullable().optional(),
  subjectId: z3.number().int().positive().nullable().optional(),
  teacherUserId: z3.number().int().positive().nullable().optional(),
  shortDescription: z3.string().trim().min(10).max(4e3),
  priceEgp: z3.number().int().min(0).max(1e7),
  scheduleText: z3.string().trim().max(2e3).nullable().optional(),
  status: z3.enum(["draft", "published", "archived"]).default("draft")
});
async function ensureRole(userId, role) {
  const db = await requireDb();
  const person = await db.select({ id: users.id }).from(users).where(and3(eq4(users.id, userId), eq4(users.role, role))).limit(1);
  if (!person[0]) throw new TRPCError4({ code: "BAD_REQUEST", message: `\u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u062F\u0648\u0631 ${role === "teacher" ? "\u0645\u0639\u0644\u0651\u0645" : "\u0637\u0627\u0644\u0628"}.` });
}
async function ensureSubject(subjectId) {
  const db = await requireDb();
  const subject = await db.select({ id: subjects.id }).from(subjects).where(eq4(subjects.id, subjectId)).limit(1);
  if (!subject[0]) throw new TRPCError4({ code: "BAD_REQUEST", message: "\u0627\u062E\u062A\u0631 \u0645\u0627\u062F\u0629 \u062F\u0631\u0627\u0633\u064A\u0629 \u0645\u0648\u062C\u0648\u062F\u0629." });
}
var adminRouter = router({
  dashboard: adminProcedure2.query(async () => {
    const db = await requireDb();
    const [studentCount, teacherCount, groupCount, attendance, recentCourses, whatsappSetting] = await Promise.all([
      db.select({ total: count() }).from(users).where(eq4(users.role, "student")),
      db.select({ total: count() }).from(users).where(eq4(users.role, "teacher")),
      db.select({ total: count() }).from(teachingGroups),
      db.select({ status: attendanceRecords.status, total: count() }).from(attendanceRecords).groupBy(attendanceRecords.status),
      db.select().from(courses).orderBy(desc2(courses.updatedAt)).limit(5),
      db.select().from(appSettings).where(eq4(appSettings.settingKey, "whatsappNumber")).limit(1)
    ]);
    return {
      students: Number(studentCount[0]?.total || 0),
      teachers: Number(teacherCount[0]?.total || 0),
      groups: Number(groupCount[0]?.total || 0),
      attendance: {
        present: Number(attendance.find((row) => row.status === "present")?.total || 0),
        absent: Number(attendance.find((row) => row.status === "absent")?.total || 0),
        late: Number(attendance.find((row) => row.status === "late")?.total || 0)
      },
      recentCourses,
      whatsappNumber: whatsappSetting[0]?.settingValue || DEFAULT_WHATSAPP_NUMBER
    };
  }),
  attendanceHistory: adminProcedure2.input(z3.object({ page: z3.number().int().min(0).default(0), pageSize: z3.number().int().min(10).max(100).default(25) })).query(async ({ input }) => {
    const db = await requireDb();
    const rows = await db.select({
      status: attendanceRecords.status,
      recordedAt: attendanceRecords.recordedAt,
      studentName: users.name,
      lessonTitle: lessons.title,
      groupName: teachingGroups.name
    }).from(attendanceRecords).innerJoin(attendanceSessions, eq4(attendanceRecords.attendanceSessionId, attendanceSessions.id)).innerJoin(lessons, eq4(attendanceSessions.lessonId, lessons.id)).innerJoin(teachingGroups, eq4(attendanceSessions.groupId, teachingGroups.id)).innerJoin(users, eq4(attendanceRecords.studentUserId, users.id)).orderBy(desc2(attendanceRecords.recordedAt)).limit(input.pageSize + 1).offset(input.page * input.pageSize);
    return { items: rows.slice(0, input.pageSize), hasMore: rows.length > input.pageSize };
  }),
  academic: router({
    list: adminProcedure2.query(async () => {
      const db = await requireDb();
      const [stages, subjectRows, groupRows, teachers, students] = await Promise.all([
        db.select().from(academicStages).orderBy(academicStages.sortOrder, academicStages.name),
        db.select({
          id: subjects.id,
          name: subjects.name,
          code: subjects.code,
          description: subjects.description,
          scheduleText: subjects.scheduleText,
          isActive: subjects.isActive,
          createdAt: subjects.createdAt,
          updatedAt: subjects.updatedAt,
          academicStageId: sql`NULL`.as("academicStageId")
        }).from(subjects).orderBy(subjects.name),
        db.select({
          id: teachingGroups.id,
          academicStageId: teachingGroups.academicStageId,
          subjectId: teachingGroups.subjectId,
          teacherUserId: teachingGroups.teacherUserId,
          name: teachingGroups.name,
          scheduleText: teachingGroups.scheduleText,
          isActive: teachingGroups.isActive,
          stageName: academicStages.name,
          subjectName: subjects.name,
          subjectScheduleText: subjects.scheduleText,
          teacherName: users.name
        }).from(teachingGroups).innerJoin(academicStages, eq4(teachingGroups.academicStageId, academicStages.id)).innerJoin(subjects, eq4(teachingGroups.subjectId, subjects.id)).leftJoin(users, eq4(teachingGroups.teacherUserId, users.id)).orderBy(teachingGroups.name),
        db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq4(users.role, "teacher")).orderBy(users.name),
        db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq4(users.role, "student")).orderBy(users.name)
      ]);
      return { stages, subjects: subjectRows, groups: groupRows, teachers, students };
    }),
    groupMembers: adminProcedure2.query(async () => {
      const db = await requireDb();
      return db.select({
        groupId: groupStudents.groupId,
        studentUserId: groupStudents.studentUserId,
        studentName: users.name,
        studentEmail: users.email
      }).from(groupStudents).innerJoin(users, eq4(groupStudents.studentUserId, users.id)).orderBy(users.name);
    }),
    createStage: adminProcedure2.input(stageInput).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.insert(academicStages).values(input);
      return { success: true };
    }),
    updateStage: adminProcedure2.input(idInput.merge(stageInput.partial())).mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...changes } = input;
      await db.update(academicStages).set(changes).where(eq4(academicStages.id, id));
      return { success: true };
    }),
    deleteStage: adminProcedure2.input(idInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const linked = await db.select({ total: count() }).from(teachingGroups).where(eq4(teachingGroups.academicStageId, input.id));
      if (Number(linked[0]?.total || 0) > 0) throw new TRPCError4({ code: "CONFLICT", message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u0645\u0631\u062D\u0644\u0629 \u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u0645\u062C\u0645\u0648\u0639\u0627\u062A." });
      await db.delete(academicStages).where(eq4(academicStages.id, input.id));
      return { success: true };
    }),
    createSubject: adminProcedure2.input(subjectInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const { academicStageId: _legacyStageId, ...subject } = input;
      await db.insert(subjects).values(subject);
      return { success: true };
    }),
    updateSubject: adminProcedure2.input(idInput.merge(subjectInput.partial())).mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...changes } = input;
      await db.update(subjects).set(changes).where(eq4(subjects.id, id));
      return { success: true };
    }),
    deleteSubject: adminProcedure2.input(idInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const [groupLinks, examLinks, courseLinks] = await Promise.all([
        db.select({ total: count() }).from(teachingGroups).where(eq4(teachingGroups.subjectId, input.id)),
        db.select({ total: count() }).from(exams).where(eq4(exams.subjectId, input.id)),
        db.select({ total: count() }).from(courses).where(eq4(courses.subjectId, input.id))
      ]);
      if (Number(groupLinks[0]?.total || 0) + Number(examLinks[0]?.total || 0) + Number(courseLinks[0]?.total || 0) > 0) {
        throw new TRPCError4({ code: "CONFLICT", message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u0645\u0627\u062F\u0629 \u0645\u0633\u062A\u062E\u062F\u0645\u0629 \u0641\u064A \u0645\u062C\u0645\u0648\u0639\u0627\u062A \u0623\u0648 \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0623\u0648 \u062F\u0648\u0631\u0627\u062A." });
      }
      await db.delete(subjects).where(eq4(subjects.id, input.id));
      return { success: true };
    }),
    createGroup: adminProcedure2.input(groupInput).mutation(async ({ input }) => {
      await Promise.all([input.teacherUserId ? ensureRole(input.teacherUserId, "teacher") : Promise.resolve(), ensureSubject(input.subjectId)]);
      const db = await requireDb();
      await db.insert(teachingGroups).values(input);
      return { success: true };
    }),
    updateGroup: adminProcedure2.input(idInput.merge(groupInput.partial())).mutation(async ({ input }) => {
      if (input.teacherUserId !== void 0 && input.teacherUserId !== null) await ensureRole(input.teacherUserId, "teacher");
      if (input.subjectId) await ensureSubject(input.subjectId);
      const db = await requireDb();
      const { id, ...changes } = input;
      await db.update(teachingGroups).set(changes).where(eq4(teachingGroups.id, id));
      return { success: true };
    }),
    deleteGroup: adminProcedure2.input(idInput).mutation(async ({ input }) => {
      const db = await requireDb();
      const [members, groupLessons, groupAssignments, groupExams] = await Promise.all([
        db.select({ total: count() }).from(groupStudents).where(eq4(groupStudents.groupId, input.id)),
        db.select({ total: count() }).from(lessons).where(eq4(lessons.groupId, input.id)),
        db.select({ total: count() }).from(assignments).where(eq4(assignments.groupId, input.id)),
        db.select({ total: count() }).from(exams).where(eq4(exams.groupId, input.id))
      ]);
      const blockers = [
        { label: "\u0637\u0644\u0627\u0628", total: Number(members[0]?.total || 0) },
        { label: "\u062F\u0631\u0648\u0633", total: Number(groupLessons[0]?.total || 0) },
        { label: "\u0648\u0627\u062C\u0628\u0627\u062A", total: Number(groupAssignments[0]?.total || 0) },
        { label: "\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A", total: Number(groupExams[0]?.total || 0) }
      ].filter((item) => item.total > 0).map((item) => `${item.label}: ${item.total}`);
      if (blockers.length) {
        throw new TRPCError4({ code: "CONFLICT", message: `\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629 \u0644\u0623\u0646\u0647\u0627 \u062A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 ${blockers.join("\u060C ")}. \u0627\u062D\u0630\u0641 \u0623\u0648 \u0627\u0646\u0642\u0644 \u0647\u0630\u0647 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0623\u0648\u0644\u064B\u0627.` });
      }
      await db.delete(teachingGroups).where(eq4(teachingGroups.id, input.id));
      return { success: true };
    }),
    deleteGroupContent: adminProcedure2.input(z3.object({ id: z3.number().int().positive(), confirmation: z3.literal("DELETE_GROUP") })).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.transaction(async (tx) => {
        const [assignmentRows, examRows, sessionRows] = await Promise.all([
          tx.select({ id: assignments.id }).from(assignments).where(eq4(assignments.groupId, input.id)),
          tx.select({ id: exams.id }).from(exams).where(eq4(exams.groupId, input.id)),
          tx.select({ id: attendanceSessions.id }).from(attendanceSessions).where(eq4(attendanceSessions.groupId, input.id))
        ]);
        const assignmentIds = assignmentRows.map((row) => row.id);
        const examIds = examRows.map((row) => row.id);
        const sessionIds = sessionRows.map((row) => row.id);
        const attemptRows = examIds.length ? await tx.select({ id: examAttempts.id }).from(examAttempts).where(inArray(examAttempts.examId, examIds)) : [];
        const attemptIds = attemptRows.map((row) => row.id);
        if (sessionIds.length) await tx.delete(attendanceRecords).where(inArray(attendanceRecords.attendanceSessionId, sessionIds));
        if (assignmentIds.length) await tx.delete(assignmentSubmissions).where(inArray(assignmentSubmissions.assignmentId, assignmentIds));
        if (attemptIds.length) await tx.delete(examAnswers).where(inArray(examAnswers.examAttemptId, attemptIds));
        if (attemptIds.length) await tx.delete(examAttempts).where(inArray(examAttempts.id, attemptIds));
        if (examIds.length) await tx.delete(examQuestions).where(inArray(examQuestions.examId, examIds));
        if (sessionIds.length) await tx.delete(attendanceSessions).where(inArray(attendanceSessions.id, sessionIds));
        if (assignmentIds.length) await tx.delete(assignments).where(inArray(assignments.id, assignmentIds));
        if (examIds.length) await tx.delete(exams).where(inArray(exams.id, examIds));
        await tx.delete(groupStudents).where(eq4(groupStudents.groupId, input.id));
        await tx.delete(lessons).where(eq4(lessons.groupId, input.id));
        await tx.delete(teachingGroups).where(eq4(teachingGroups.id, input.id));
      });
      return { success: true };
    }),
    enrollStudent: adminProcedure2.input(z3.object({ groupId: z3.number().int().positive(), studentUserId: z3.number().int().positive() })).mutation(async ({ input }) => {
      await ensureRole(input.studentUserId, "student");
      const db = await requireDb();
      await db.insert(groupStudents).values(input).onDuplicateKeyUpdate({ set: { studentUserId: input.studentUserId } });
      return { success: true };
    }),
    removeStudent: adminProcedure2.input(z3.object({ groupId: z3.number().int().positive(), studentUserId: z3.number().int().positive() })).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(groupStudents).where(and3(eq4(groupStudents.groupId, input.groupId), eq4(groupStudents.studentUserId, input.studentUserId)));
      return { success: true };
    })
  }),
  people: router({
    list: adminProcedure2.query(async () => {
      const db = await requireDb();
      return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive, createdAt: users.createdAt }).from(users).orderBy(users.role, users.name);
    }),
    create: adminProcedure2.input(z3.object({ name: z3.string().trim().min(2).max(160), email: z3.string().trim().email().max(320), role: z3.enum(["teacher", "student"]) })).mutation(async ({ input }) => {
      const db = await requireDb();
      const email = input.email.toLowerCase();
      const existing = await db.select({ id: users.id }).from(users).where(eq4(users.email, email)).limit(1);
      if (existing[0]) throw new TRPCError4({ code: "CONFLICT", message: "\u064A\u0648\u062C\u062F \u062D\u0633\u0627\u0628 \u0623\u0648 \u062F\u0639\u0648\u0629 \u0645\u0633\u062C\u0644\u0629 \u0628\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A." });
      const openId = `pending:${nanoid(18)}`;
      const userId = await db.transaction(async (tx) => {
        const inserted = await tx.insert(users).values({ openId, name: input.name, email, role: input.role, isActive: true, loginMethod: "pending" });
        const createdUserId = Number(inserted.insertId);
        if (input.role === "teacher") await tx.insert(teacherProfiles).values({ userId: createdUserId });
        if (input.role === "student") await tx.insert(studentProfiles).values({ userId: createdUserId });
        return createdUserId;
      });
      return { success: true, userId };
    }),
    update: adminProcedure2.input(z3.object({ userId: z3.number().int().positive(), name: z3.string().trim().min(2).max(160), email: z3.string().trim().email().max(320) })).mutation(async ({ input }) => {
      const db = await requireDb();
      const email = input.email.toLowerCase();
      const existing = await db.select({ id: users.id }).from(users).where(eq4(users.email, email)).limit(1);
      if (existing[0] && existing[0].id !== input.userId) {
        throw new TRPCError4({ code: "CONFLICT", message: "\u064A\u0648\u062C\u062F \u062D\u0633\u0627\u0628 \u0623\u0648 \u062F\u0639\u0648\u0629 \u0645\u0633\u062C\u0644\u0629 \u0628\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A." });
      }
      await db.update(users).set({ name: input.name, email }).where(eq4(users.id, input.userId));
      return { success: true };
    }),
    setActive: adminProcedure2.input(z3.object({ userId: z3.number().int().positive(), isActive: z3.boolean() })).mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id && !input.isActive) throw new TRPCError4({ code: "BAD_REQUEST", message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0639\u0637\u064A\u0644 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u062D\u0627\u0644\u064A." });
      const db = await requireDb();
      await db.update(users).set({ isActive: input.isActive, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq4(users.id, input.userId));
      return { success: true };
    }),
    updateRole: adminProcedure2.input(z3.object({ userId: z3.number().int().positive(), role: z3.enum(["teacher", "student", "admin"]) })).mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id && input.role !== "admin") throw new TRPCError4({ code: "BAD_REQUEST", message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0632\u0627\u0644\u0629 \u062F\u0648\u0631 \u0627\u0644\u0645\u062F\u064A\u0631 \u0645\u0646 \u062D\u0633\u0627\u0628\u0643 \u0627\u0644\u062D\u0627\u0644\u064A." });
      const db = await requireDb();
      await db.transaction(async (tx) => {
        await tx.update(users).set({ role: input.role, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq4(users.id, input.userId));
        if (input.role === "teacher") await tx.insert(teacherProfiles).values({ userId: input.userId }).onDuplicateKeyUpdate({ set: { userId: input.userId } });
        if (input.role === "student") await tx.insert(studentProfiles).values({ userId: input.userId }).onDuplicateKeyUpdate({ set: { userId: input.userId } });
      });
      return { success: true };
    })
  }),
  courses: router({
    list: adminProcedure2.query(async () => {
      const db = await requireDb();
      return db.select().from(courses).orderBy(desc2(courses.updatedAt));
    }),
    create: adminProcedure2.input(courseInput).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.insert(courses).values(input);
      return { success: true };
    }),
    update: adminProcedure2.input(idInput.merge(courseInput.partial())).mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...changes } = input;
      await db.update(courses).set(changes).where(eq4(courses.id, id));
      return { success: true };
    }),
    delete: adminProcedure2.input(idInput).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(courses).where(eq4(courses.id, input.id));
      return { success: true };
    })
  }),
  settings: router({
    get: adminProcedure2.query(async () => {
      const db = await requireDb();
      const setting = await db.select().from(appSettings).where(eq4(appSettings.settingKey, "whatsappNumber")).limit(1);
      return { whatsappNumber: setting[0]?.settingValue || DEFAULT_WHATSAPP_NUMBER };
    }),
    updateWhatsApp: adminProcedure2.input(z3.object({ whatsappNumber: z3.string().trim().regex(/^\+?[0-9]{8,16}$/, "\u0623\u062F\u062E\u0644 \u0631\u0642\u0645 WhatsApp \u062F\u0648\u0644\u064A\u064B\u0627 \u0635\u062D\u064A\u062D\u064B\u0627.") })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const normalized = input.whatsappNumber.startsWith("+") ? input.whatsappNumber : `+${input.whatsappNumber}`;
      await db.insert(appSettings).values({ settingKey: "whatsappNumber", settingValue: normalized, updatedByUserId: ctx.user.id }).onDuplicateKeyUpdate({ set: { settingValue: normalized, updatedByUserId: ctx.user.id } });
      return { success: true, whatsappNumber: normalized };
    })
  })
});

// server/routers/profile.ts
import { TRPCError as TRPCError6 } from "@trpc/server";
import { eq as eq5 } from "drizzle-orm";
import { z as z4 } from "zod";

// server/domain/profileRules.ts
import { TRPCError as TRPCError5 } from "@trpc/server";
var MAX_AVATAR_BYTES = 15e5;
var MIME_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
function hasExpectedImageSignature(bytes, mimeType) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}
function parseAvatarDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new TRPCError5({ code: "BAD_REQUEST", message: "\u0627\u0644\u0635\u0648\u0631\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 JPG \u0623\u0648 PNG \u0623\u0648 WebP." });
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) throw new TRPCError5({ code: "PAYLOAD_TOO_LARGE", message: "\u062D\u062C\u0645 \u0627\u0644\u0635\u0648\u0631\u0629 \u064A\u062C\u0628 \u0623\u0644\u0627 \u064A\u062A\u062C\u0627\u0648\u0632 1.5 \u0645\u064A\u062C\u0627\u0628\u0627\u064A\u062A." });
  if (!hasExpectedImageSignature(bytes, match[1])) throw new TRPCError5({ code: "BAD_REQUEST", message: "\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u0631\u0629 \u0644\u0627 \u064A\u0637\u0627\u0628\u0642 \u0646\u0648\u0639\u0647\u0627 \u0627\u0644\u0645\u0639\u0644\u0646." });
  return { bytes, mimeType: match[1], extension: MIME_EXTENSIONS[match[1]] };
}

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}

// server/routers/profile.ts
async function getOwnedProfile(userId) {
  const db = await requireDb();
  const account = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, avatarUrl: users.avatarUrl }).from(users).where(eq5(users.id, userId)).limit(1);
  if (!account[0]) throw new TRPCError6({ code: "NOT_FOUND", message: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0627\u0644\u062D\u0633\u0627\u0628." });
  const teacher = account[0].role === "teacher" ? await db.select().from(teacherProfiles).where(eq5(teacherProfiles.userId, userId)).limit(1) : [];
  const student = account[0].role === "student" ? await db.select().from(studentProfiles).where(eq5(studentProfiles.userId, userId)).limit(1) : [];
  return { ...account[0], teacher: teacher[0] || null, student: student[0] || null };
}
function requireProfileRole(role) {
  if (role !== "teacher" && role !== "student") throw new TRPCError6({ code: "FORBIDDEN", message: "\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062E\u0635\u064A \u0645\u062A\u0627\u062D \u0644\u0644\u0637\u0644\u0627\u0628 \u0648\u0627\u0644\u0645\u0639\u0644\u0651\u0645\u064A\u0646 \u0641\u0642\u0637." });
}
var profileRouter = router({
  get: protectedProcedure.query(({ ctx }) => {
    requireProfileRole(ctx.user.role);
    return getOwnedProfile(ctx.user.id);
  }),
  update: protectedProcedure.input(z4.object({ name: z4.string().trim().min(2).max(160), bio: z4.string().trim().max(1600).nullable().optional(), telegramLink: z4.string().trim().url().max(512).nullable().optional(), guardianPhone: z4.string().trim().max(32).nullable().optional() })).mutation(async ({ ctx, input }) => {
    requireProfileRole(ctx.user.role);
    const db = await requireDb();
    await db.transaction(async (tx) => {
      await tx.update(users).set({ name: input.name }).where(eq5(users.id, ctx.user.id));
      if (ctx.user.role === "teacher") await tx.insert(teacherProfiles).values({ userId: ctx.user.id, bio: input.bio ?? null, telegramLink: input.telegramLink ?? null }).onDuplicateKeyUpdate({ set: { bio: input.bio ?? null, telegramLink: input.telegramLink ?? null } });
      if (ctx.user.role === "student") await tx.insert(studentProfiles).values({ userId: ctx.user.id, guardianPhone: input.guardianPhone ?? null }).onDuplicateKeyUpdate({ set: { guardianPhone: input.guardianPhone ?? null } });
    });
    return getOwnedProfile(ctx.user.id);
  }),
  uploadAvatar: protectedProcedure.input(z4.object({ imageData: z4.string().min(1).max(21e5) })).mutation(async ({ ctx, input }) => {
    requireProfileRole(ctx.user.role);
    const image = parseAvatarDataUrl(input.imageData);
    const stored = await storagePut(`profile-avatars/${ctx.user.id}/avatar.${image.extension}`, image.bytes, image.mimeType);
    const db = await requireDb();
    await db.update(users).set({ avatarUrl: stored.url }).where(eq5(users.id, ctx.user.id));
    return { avatarUrl: stored.url };
  })
});

// server/routers/student.ts
import { TRPCError as TRPCError7 } from "@trpc/server";
import { and as and4, asc, desc as desc3, eq as eq6, inArray as inArray2 } from "drizzle-orm";
import { z as z5 } from "zod";

// server/domain/assessmentRules.ts
function calculateAutoScore(questions, answers) {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  return questions.reduce((score, question) => {
    if (question.questionType !== "multiple_choice") return score;
    return score + Number(answerByQuestion.get(question.id)?.selectedChoiceIndex === question.correctChoiceIndex);
  }, 0);
}
function examDeadline(examEndsAt, attemptStartedAt, durationMinutes) {
  return new Date(Math.min(examEndsAt.getTime(), attemptStartedAt.getTime() + durationMinutes * 6e4));
}
function isAttemptExpired(examEndsAt, attemptStartedAt, durationMinutes, now = /* @__PURE__ */ new Date()) {
  return now > examDeadline(examEndsAt, attemptStartedAt, durationMinutes);
}
function canStartNewAttempt(existingAttemptCount, allowedAttempts) {
  return existingAttemptCount < allowedAttempts;
}
function answersBelongToExam(questionIds, answerIds) {
  const validQuestions = new Set(questionIds);
  return answerIds.every((answerId) => validQuestions.has(answerId));
}

// server/domain/attendanceRules.ts
function summarizeAttendance(statuses) {
  return statuses.reduce(
    (summary, status) => ({ ...summary, [status]: summary[status] + 1 }),
    { present: 0, absent: 0, late: 0 }
  );
}
function isCompleteAttendanceBatch(enrolledStudentIds, recordedStudentIds) {
  const enrolled = new Set(enrolledStudentIds);
  const recorded = new Set(recordedStudentIds);
  return enrolled.size === recorded.size && enrolled.size === enrolledStudentIds.length && recordedStudentIds.every((studentId) => enrolled.has(studentId));
}

// server/routers/student.ts
var answerInput = z5.object({ questionId: z5.number().int().positive(), selectedChoiceIndex: z5.number().int().min(0).max(7).nullable().optional(), essayAnswer: z5.string().max(12e3).nullable().optional() });
async function requireStudentAttempt(attemptId, studentUserId) {
  const db = await requireDb();
  const attempt = await db.select({ attempt: examAttempts, exam: exams }).from(examAttempts).innerJoin(exams, eq6(examAttempts.examId, exams.id)).innerJoin(groupStudents, and4(eq6(exams.groupId, groupStudents.groupId), eq6(groupStudents.studentUserId, studentUserId))).where(and4(eq6(examAttempts.id, attemptId), eq6(examAttempts.studentUserId, studentUserId))).limit(1);
  if (!attempt[0]) throw new TRPCError7({ code: "FORBIDDEN", message: "\u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629." });
  return attempt[0];
}
function isExamWindowOpen(exam) {
  const now = /* @__PURE__ */ new Date();
  return now >= exam.startsAt && now <= exam.endsAt;
}
function canAccessExam(exam) {
  return exam.status === "published" && isExamWindowOpen(exam);
}
var studentRouter = router({
  dashboard: studentProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rawGroups = await db.select({ id: teachingGroups.id, name: teachingGroups.name, groupScheduleText: teachingGroups.scheduleText, subjectScheduleText: subjects.scheduleText, subjectName: subjects.name }).from(groupStudents).innerJoin(teachingGroups, eq6(groupStudents.groupId, teachingGroups.id)).innerJoin(subjects, eq6(teachingGroups.subjectId, subjects.id)).where(eq6(groupStudents.studentUserId, ctx.user.id)).orderBy(teachingGroups.name);
    const groups = rawGroups.map((group) => ({ ...group, scheduleText: group.groupScheduleText || group.subjectScheduleText || null, scheduleSource: group.groupScheduleText ? "group" : group.subjectScheduleText ? "subject" : "none" }));
    const groupIds = groups.map((group) => group.id);
    if (!groupIds.length) return { groups, lessons: [], assignments: [], exams: [], results: [], attendance: [], attendanceSummary: { present: 0, absent: 0, late: 0 } };
    const [lessonRows, assignmentRows, examRows, results, attendance] = await Promise.all([
      db.select({ id: lessons.id, title: lessons.title, startsAt: lessons.startsAt, endsAt: lessons.endsAt, zoomLink: lessons.zoomLink, groupName: teachingGroups.name }).from(lessons).innerJoin(teachingGroups, eq6(lessons.groupId, teachingGroups.id)).where(inArray2(lessons.groupId, groupIds)).orderBy(asc(lessons.startsAt)).limit(8),
      db.select({ id: assignments.id, title: assignments.title, instructions: assignments.instructions, dueAt: assignments.dueAt, groupName: teachingGroups.name, teacherName: users.name, telegramLink: teacherProfiles.telegramLink }).from(assignments).innerJoin(teachingGroups, eq6(assignments.groupId, teachingGroups.id)).innerJoin(users, eq6(assignments.teacherUserId, users.id)).leftJoin(teacherProfiles, eq6(assignments.teacherUserId, teacherProfiles.userId)).where(and4(inArray2(assignments.groupId, groupIds), eq6(assignments.isPublished, true))).orderBy(desc3(assignments.createdAt)).limit(8),
      db.select({ id: exams.id, title: exams.title, startsAt: exams.startsAt, endsAt: exams.endsAt, durationMinutes: exams.durationMinutes, allowedAttempts: exams.allowedAttempts, groupName: teachingGroups.name }).from(exams).innerJoin(teachingGroups, eq6(exams.groupId, teachingGroups.id)).where(and4(inArray2(exams.groupId, groupIds), eq6(exams.status, "published"))).orderBy(asc(exams.startsAt)).limit(8),
      db.select({ attemptId: examAttempts.id, examTitle: exams.title, finalScore: examAttempts.finalScore, status: examAttempts.status, submittedAt: examAttempts.submittedAt }).from(examAttempts).innerJoin(exams, eq6(examAttempts.examId, exams.id)).where(eq6(examAttempts.studentUserId, ctx.user.id)).orderBy(desc3(examAttempts.updatedAt)).limit(8),
      db.select({ status: attendanceRecords.status, recordedAt: attendanceRecords.recordedAt, lessonTitle: lessons.title, groupName: teachingGroups.name }).from(attendanceRecords).innerJoin(attendanceSessions, eq6(attendanceRecords.attendanceSessionId, attendanceSessions.id)).innerJoin(lessons, eq6(attendanceSessions.lessonId, lessons.id)).innerJoin(teachingGroups, eq6(attendanceSessions.groupId, teachingGroups.id)).where(eq6(attendanceRecords.studentUserId, ctx.user.id)).orderBy(desc3(attendanceRecords.recordedAt)).limit(10)
    ]);
    return { groups, lessons: lessonRows, assignments: assignmentRows, exams: examRows.filter(isExamWindowOpen), results, attendance, attendanceSummary: summarizeAttendance(attendance.map((record) => record.status)) };
  }),
  assignments: studentProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select({ id: assignments.id, groupId: assignments.groupId, title: assignments.title, instructions: assignments.instructions, dueAt: assignments.dueAt, createdAt: assignments.createdAt, groupName: teachingGroups.name, teacherName: users.name, telegramLink: teacherProfiles.telegramLink, submissionStatus: assignmentSubmissions.status, sentAt: assignmentSubmissions.sentAt, confirmedAt: assignmentSubmissions.confirmedAt }).from(assignments).innerJoin(groupStudents, and4(eq6(assignments.groupId, groupStudents.groupId), eq6(groupStudents.studentUserId, ctx.user.id))).innerJoin(teachingGroups, eq6(assignments.groupId, teachingGroups.id)).innerJoin(users, eq6(assignments.teacherUserId, users.id)).leftJoin(teacherProfiles, eq6(assignments.teacherUserId, teacherProfiles.userId)).leftJoin(assignmentSubmissions, and4(eq6(assignmentSubmissions.assignmentId, assignments.id), eq6(assignmentSubmissions.studentUserId, ctx.user.id))).where(eq6(assignments.isPublished, true)).orderBy(desc3(assignments.createdAt));
  }),
  markAssignmentSent: studentProcedure.input(z5.object({ assignmentId: z5.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const assignment = await db.select({ id: assignments.id }).from(assignments).innerJoin(groupStudents, and4(eq6(assignments.groupId, groupStudents.groupId), eq6(groupStudents.studentUserId, ctx.user.id))).where(and4(eq6(assignments.id, input.assignmentId), eq6(assignments.isPublished, true))).limit(1);
    if (!assignment[0]) throw new TRPCError7({ code: "FORBIDDEN", message: "\u0647\u0630\u0627 \u0627\u0644\u0648\u0627\u062C\u0628 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0644\u0643." });
    const existing = await db.select().from(assignmentSubmissions).where(and4(eq6(assignmentSubmissions.assignmentId, input.assignmentId), eq6(assignmentSubmissions.studentUserId, ctx.user.id))).limit(1);
    if (existing[0]?.status === "confirmed") return { success: true, status: "confirmed" };
    await db.insert(assignmentSubmissions).values({ assignmentId: input.assignmentId, studentUserId: ctx.user.id, status: "sent", sentAt: /* @__PURE__ */ new Date(), confirmedAt: null }).onDuplicateKeyUpdate({ set: { status: "sent", sentAt: /* @__PURE__ */ new Date(), confirmedAt: null } });
    return { success: true, status: "sent" };
  }),
  materials: studentProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const groups = await db.select({ id: teachingGroups.id, name: teachingGroups.name, groupScheduleText: teachingGroups.scheduleText, subjectScheduleText: subjects.scheduleText, subjectId: subjects.id, subjectName: subjects.name }).from(groupStudents).innerJoin(teachingGroups, eq6(groupStudents.groupId, teachingGroups.id)).innerJoin(subjects, eq6(teachingGroups.subjectId, subjects.id)).where(eq6(groupStudents.studentUserId, ctx.user.id)).orderBy(subjects.name, teachingGroups.name);
    const groupIds = groups.map((group) => group.id);
    if (!groupIds.length) return [];
    const lessonRows = await db.select({ id: lessons.id, groupId: lessons.groupId, title: lessons.title, startsAt: lessons.startsAt, endsAt: lessons.endsAt, zoomLink: lessons.zoomLink, isActive: lessons.isActive }).from(lessons).where(inArray2(lessons.groupId, groupIds)).orderBy(asc(lessons.startsAt));
    return groups.map((group) => ({ ...group, scheduleText: group.groupScheduleText || group.subjectScheduleText || null, scheduleSource: group.groupScheduleText ? "group" : group.subjectScheduleText ? "subject" : "none", lessons: lessonRows.filter((lesson) => lesson.groupId === group.id && lesson.isActive) }));
  }),
  attendance: studentProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select({ status: attendanceRecords.status, recordedAt: attendanceRecords.recordedAt, lessonTitle: lessons.title, groupId: teachingGroups.id, groupName: teachingGroups.name, subjectId: subjects.id, subjectName: subjects.name }).from(attendanceRecords).innerJoin(attendanceSessions, eq6(attendanceRecords.attendanceSessionId, attendanceSessions.id)).innerJoin(lessons, eq6(attendanceSessions.lessonId, lessons.id)).innerJoin(teachingGroups, eq6(attendanceSessions.groupId, teachingGroups.id)).innerJoin(subjects, eq6(teachingGroups.subjectId, subjects.id)).where(eq6(attendanceRecords.studentUserId, ctx.user.id)).orderBy(desc3(attendanceRecords.recordedAt));
  }),
  results: studentProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select({ attemptId: examAttempts.id, groupId: exams.groupId, examTitle: exams.title, examType: exams.examType, finalScore: examAttempts.finalScore, autoScore: examAttempts.autoScore, manualScore: examAttempts.manualScore, status: examAttempts.status, submittedAt: examAttempts.submittedAt, groupName: teachingGroups.name }).from(examAttempts).innerJoin(exams, eq6(examAttempts.examId, exams.id)).innerJoin(teachingGroups, eq6(exams.groupId, teachingGroups.id)).where(eq6(examAttempts.studentUserId, ctx.user.id)).orderBy(desc3(examAttempts.updatedAt));
  }),
  exams: router({
    available: studentProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const rows = await db.select({ id: exams.id, groupId: exams.groupId, title: exams.title, startsAt: exams.startsAt, endsAt: exams.endsAt, durationMinutes: exams.durationMinutes, allowedAttempts: exams.allowedAttempts, examType: exams.examType, groupName: teachingGroups.name }).from(exams).innerJoin(groupStudents, and4(eq6(exams.groupId, groupStudents.groupId), eq6(groupStudents.studentUserId, ctx.user.id))).innerJoin(teachingGroups, eq6(exams.groupId, teachingGroups.id)).where(eq6(exams.status, "published")).orderBy(asc(exams.startsAt));
      return rows.filter(isExamWindowOpen);
    }),
    start: studentProcedure.input(z5.object({ examId: z5.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const examRows = await db.select().from(exams).innerJoin(groupStudents, and4(eq6(exams.groupId, groupStudents.groupId), eq6(groupStudents.studentUserId, ctx.user.id))).where(eq6(exams.id, input.examId)).limit(1);
      const exam = examRows[0]?.exams;
      if (!exam || !canAccessExam(exam)) throw new TRPCError7({ code: "FORBIDDEN", message: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0641\u064A \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u062D\u0627\u0644\u064A." });
      const active = await db.select().from(examAttempts).where(and4(eq6(examAttempts.examId, input.examId), eq6(examAttempts.studentUserId, ctx.user.id), eq6(examAttempts.status, "in_progress"))).orderBy(desc3(examAttempts.startedAt)).limit(1);
      if (active[0]) return { attemptId: active[0].id, resumed: true };
      const previous = await db.select({ id: examAttempts.id }).from(examAttempts).where(and4(eq6(examAttempts.examId, input.examId), eq6(examAttempts.studentUserId, ctx.user.id)));
      if (!canStartNewAttempt(previous.length, exam.allowedAttempts)) throw new TRPCError7({ code: "CONFLICT", message: "\u0627\u0633\u062A\u064F\u0647\u0644\u0643 \u0639\u062F\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u062A\u0627\u062D\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631." });
      try {
        const inserted = await db.insert(examAttempts).values({ examId: input.examId, studentUserId: ctx.user.id, attemptNumber: previous.length + 1 });
        return { attemptId: Number(inserted.insertId), resumed: false };
      } catch (error) {
        const isDuplicateAttempt = typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
        if (!isDuplicateAttempt) throw error;
        const concurrentActive = await db.select().from(examAttempts).where(and4(eq6(examAttempts.examId, input.examId), eq6(examAttempts.studentUserId, ctx.user.id), eq6(examAttempts.status, "in_progress"))).orderBy(desc3(examAttempts.startedAt)).limit(1);
        if (concurrentActive[0]) return { attemptId: concurrentActive[0].id, resumed: true };
        throw new TRPCError7({ code: "CONFLICT", message: "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u062D\u0627\u0648\u0644\u0629 \u0623\u062E\u0631\u0649\u061B \u0623\u0639\u062F \u0641\u062A\u062D \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0644\u0645\u062A\u0627\u0628\u0639\u062A\u0647\u0627." });
      }
    }),
    attempt: studentProcedure.input(z5.object({ attemptId: z5.number().int().positive() })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const access = await requireStudentAttempt(input.attemptId, ctx.user.id);
      const questions = await db.select({ id: examQuestions.id, questionType: examQuestions.questionType, prompt: examQuestions.prompt, choices: examQuestions.choices, sortOrder: examQuestions.sortOrder }).from(examQuestions).where(eq6(examQuestions.examId, access.exam.id)).orderBy(examQuestions.sortOrder);
      const answers = await db.select({ questionId: examAnswers.questionId, selectedChoiceIndex: examAnswers.selectedChoiceIndex, essayAnswer: examAnswers.essayAnswer }).from(examAnswers).where(eq6(examAnswers.examAttemptId, input.attemptId));
      return { attempt: access.attempt, exam: access.exam, questions, answers };
    }),
    submit: studentProcedure.input(z5.object({ attemptId: z5.number().int().positive(), answers: z5.array(answerInput).max(100) })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const access = await requireStudentAttempt(input.attemptId, ctx.user.id);
      if (access.attempt.status !== "in_progress") throw new TRPCError7({ code: "CONFLICT", message: "\u062A\u0645 \u062A\u0633\u0644\u064A\u0645 \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0633\u0628\u0642\u064B\u0627." });
      if (isAttemptExpired(access.exam.endsAt, access.attempt.startedAt, access.exam.durationMinutes)) {
        await db.update(examAttempts).set({ status: "expired", submittedAt: /* @__PURE__ */ new Date() }).where(eq6(examAttempts.id, input.attemptId));
        throw new TRPCError7({ code: "TIMEOUT", message: "\u0627\u0646\u062A\u0647\u0649 \u0648\u0642\u062A \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629." });
      }
      const submission = await db.transaction(async (tx) => {
        const questions = await tx.select().from(examQuestions).where(eq6(examQuestions.examId, access.exam.id)).orderBy(examQuestions.sortOrder);
        const responseByQuestion = new Map(input.answers.map((answer) => [answer.questionId, answer]));
        if (!answersBelongToExam(questions.map((question) => question.id), input.answers.map((answer) => answer.questionId))) throw new TRPCError7({ code: "BAD_REQUEST", message: "\u062A\u062A\u0636\u0645\u0646 \u0627\u0644\u0625\u062C\u0627\u0628\u0627\u062A \u0633\u0624\u0627\u0644\u064B\u0627 \u063A\u064A\u0631 \u062A\u0627\u0628\u0639 \u0644\u0644\u0627\u062E\u062A\u0628\u0627\u0631." });
        const submitted = questions.map((question) => ({ questionId: question.id, selectedChoiceIndex: responseByQuestion.get(question.id)?.selectedChoiceIndex ?? null }));
        const autoScore = calculateAutoScore(questions, submitted);
        for (const question of questions) {
          const response = responseByQuestion.get(question.id);
          const selectedChoiceIndex = response?.selectedChoiceIndex ?? null;
          const essayAnswer = response?.essayAnswer?.trim() || null;
          const isCorrect = question.questionType === "multiple_choice" ? selectedChoiceIndex === question.correctChoiceIndex : null;
          await tx.insert(examAnswers).values({ examAttemptId: input.attemptId, questionId: question.id, selectedChoiceIndex, essayAnswer, isCorrect }).onDuplicateKeyUpdate({ set: { selectedChoiceIndex, essayAnswer, isCorrect } });
        }
        await tx.update(examAttempts).set({ status: "submitted", submittedAt: /* @__PURE__ */ new Date(), autoScore, manualScore: 0, finalScore: autoScore }).where(eq6(examAttempts.id, input.attemptId));
        return { score: autoScore, totalQuestions: questions.length };
      });
      return { success: true, ...submission };
    }),
    result: studentProcedure.input(z5.object({ attemptId: z5.number().int().positive() })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const access = await requireStudentAttempt(input.attemptId, ctx.user.id);
      if (access.attempt.status === "in_progress") throw new TRPCError7({ code: "FORBIDDEN", message: "\u062A\u0638\u0647\u0631 \u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0628\u0639\u062F \u062A\u0633\u0644\u064A\u0645 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631." });
      const answers = await db.select({ prompt: examQuestions.prompt, questionType: examQuestions.questionType, choices: examQuestions.choices, correctChoiceIndex: examQuestions.correctChoiceIndex, selectedChoiceIndex: examAnswers.selectedChoiceIndex, essayAnswer: examAnswers.essayAnswer, isCorrect: examAnswers.isCorrect, reviewedScore: examAnswers.reviewedScore }).from(examAnswers).innerJoin(examQuestions, eq6(examAnswers.questionId, examQuestions.id)).where(eq6(examAnswers.examAttemptId, input.attemptId)).orderBy(examQuestions.sortOrder);
      return { attempt: access.attempt, exam: access.exam, answers };
    })
  })
});

// server/routers/teacher.ts
import { TRPCError as TRPCError8 } from "@trpc/server";
import { and as and5, count as count2, desc as desc4, eq as eq7, inArray as inArray3 } from "drizzle-orm";
import { z as z6 } from "zod";
var groupIdInput = z6.object({ groupId: z6.number().int().positive() });
var datetimeInput = z6.string().datetime({ offset: true });
var attendanceStatus = z6.enum(["present", "absent", "late"]);
var questionInput = z6.object({
  questionType: z6.enum(["multiple_choice", "essay"]),
  prompt: z6.string().trim().min(1).max(5e3),
  choices: z6.array(z6.string().trim().min(1).max(500)).max(8).optional(),
  correctChoiceIndex: z6.number().int().min(0).max(7).optional(),
  sortOrder: z6.number().int().min(0).max(9999).default(0)
});
async function requireTeacherExam(examId, teacherUserId) {
  const db = await requireDb();
  const result = await db.select().from(exams).where(and5(eq7(exams.id, examId), eq7(exams.teacherUserId, teacherUserId))).limit(1);
  if (!result[0]) throw new TRPCError8({ code: "FORBIDDEN", message: "\u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0639\u0644\u0651\u0645." });
  return result[0];
}
function validateQuestion(question) {
  if (question.questionType === "multiple_choice") {
    if (!question.choices || question.choices.length < 2 || question.correctChoiceIndex === void 0 || question.correctChoiceIndex >= question.choices.length) {
      throw new TRPCError8({ code: "BAD_REQUEST", message: "\u0633\u0624\u0627\u0644 \u0627\u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646 \u0645\u062A\u0639\u062F\u062F \u064A\u062D\u062A\u0627\u062C \u062E\u064A\u0627\u0631\u064A\u0646 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0648\u0625\u062C\u0627\u0628\u0629 \u0635\u062D\u064A\u062D\u0629." });
    }
  }
}
var teacherRouter = router({
  dashboard: teacherProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [groupCount, studentCount, pendingEssayCount, upcomingLessons] = await Promise.all([
      db.select({ total: count2() }).from(teachingGroups).where(eq7(teachingGroups.teacherUserId, ctx.user.id)),
      db.select({ total: count2() }).from(groupStudents).innerJoin(teachingGroups, eq7(groupStudents.groupId, teachingGroups.id)).where(eq7(teachingGroups.teacherUserId, ctx.user.id)),
      db.select({ total: count2() }).from(examAnswers).innerJoin(examQuestions, eq7(examAnswers.questionId, examQuestions.id)).innerJoin(examAttempts, eq7(examAnswers.examAttemptId, examAttempts.id)).innerJoin(exams, eq7(examAttempts.examId, exams.id)).where(and5(eq7(exams.teacherUserId, ctx.user.id), eq7(examQuestions.questionType, "essay"))),
      db.select({ id: lessons.id, title: lessons.title, startsAt: lessons.startsAt, groupName: teachingGroups.name }).from(lessons).innerJoin(teachingGroups, eq7(lessons.groupId, teachingGroups.id)).where(eq7(teachingGroups.teacherUserId, ctx.user.id)).orderBy(desc4(lessons.startsAt)).limit(5)
    ]);
    return {
      groups: Number(groupCount[0]?.total || 0),
      students: Number(studentCount[0]?.total || 0),
      pendingEssayReviews: Number(pendingEssayCount[0]?.total || 0),
      upcomingLessons
    };
  }),
  groups: teacherProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rawGroups = await db.select({ id: teachingGroups.id, name: teachingGroups.name, groupScheduleText: teachingGroups.scheduleText, subjectScheduleText: subjects.scheduleText, subjectId: teachingGroups.subjectId, subjectName: subjects.name }).from(teachingGroups).innerJoin(subjects, eq7(teachingGroups.subjectId, subjects.id)).where(eq7(teachingGroups.teacherUserId, ctx.user.id)).orderBy(teachingGroups.name);
    return rawGroups.map((group) => ({ ...group, scheduleText: group.groupScheduleText || group.subjectScheduleText || null, scheduleSource: group.groupScheduleText ? "group" : group.subjectScheduleText ? "subject" : "none" }));
  }),
  profile: router({
    get: teacherProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const profile = await db.select().from(teacherProfiles).where(eq7(teacherProfiles.userId, ctx.user.id)).limit(1);
      return profile[0] || null;
    }),
    update: teacherProcedure.input(z6.object({ telegramLink: z6.string().trim().max(512).nullable().optional(), bio: z6.string().trim().max(2e3).nullable().optional() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.insert(teacherProfiles).values({ userId: ctx.user.id, ...input }).onDuplicateKeyUpdate({ set: input });
      return { success: true };
    })
  }),
  roster: teacherProcedure.input(groupIdInput).query(async ({ input, ctx }) => {
    const db = await requireDb();
    await requireTeacherGroup(db, input.groupId, ctx.user.id);
    return db.select({ id: users.id, name: users.name, email: users.email, guardianPhone: studentProfiles.guardianPhone }).from(groupStudents).innerJoin(users, eq7(groupStudents.studentUserId, users.id)).leftJoin(studentProfiles, eq7(users.id, studentProfiles.userId)).where(eq7(groupStudents.groupId, input.groupId)).orderBy(users.name);
  }),
  lessons: router({
    list: teacherProcedure.input(groupIdInput).query(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireTeacherGroup(db, input.groupId, ctx.user.id);
      return db.select().from(lessons).where(eq7(lessons.groupId, input.groupId)).orderBy(lessons.startsAt);
    }),
    create: teacherProcedure.input(z6.object({ groupId: z6.number().int().positive(), title: z6.string().trim().min(2).max(240), description: z6.string().trim().max(4e3).nullable().optional(), startsAt: datetimeInput.nullable().optional(), endsAt: datetimeInput.nullable().optional(), zoomLink: z6.string().trim().url().max(2048).nullable().optional() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireTeacherGroup(db, input.groupId, ctx.user.id);
      await db.insert(lessons).values({ ...input, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null });
      return { success: true };
    }),
    update: teacherProcedure.input(z6.object({ id: z6.number().int().positive(), title: z6.string().trim().min(2).max(240).optional(), description: z6.string().trim().max(4e3).nullable().optional(), startsAt: datetimeInput.nullable().optional(), endsAt: datetimeInput.nullable().optional(), zoomLink: z6.string().trim().url().max(2048).nullable().optional(), isActive: z6.boolean().optional() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const current = await db.select().from(lessons).where(eq7(lessons.id, input.id)).limit(1);
      if (!current[0]) throw new TRPCError8({ code: "NOT_FOUND", message: "\u0627\u0644\u062F\u0631\u0633 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
      await requireTeacherGroup(db, current[0].groupId, ctx.user.id);
      const { id, startsAt, endsAt, ...changes } = input;
      await db.update(lessons).set({ ...changes, ...startsAt !== void 0 ? { startsAt: startsAt ? new Date(startsAt) : null } : {}, ...endsAt !== void 0 ? { endsAt: endsAt ? new Date(endsAt) : null } : {} }).where(eq7(lessons.id, id));
      return { success: true };
    }),
    delete: teacherProcedure.input(z6.object({ id: z6.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const current = await db.select().from(lessons).where(eq7(lessons.id, input.id)).limit(1);
      if (!current[0]) throw new TRPCError8({ code: "NOT_FOUND", message: "\u0627\u0644\u062F\u0631\u0633 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
      await requireTeacherGroup(db, current[0].groupId, ctx.user.id);
      await db.delete(lessons).where(eq7(lessons.id, input.id));
      return { success: true };
    })
  }),
  attendance: router({
    get: teacherProcedure.input(z6.object({ lessonId: z6.number().int().positive() })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const lesson = await db.select().from(lessons).where(eq7(lessons.id, input.lessonId)).limit(1);
      if (!lesson[0]) throw new TRPCError8({ code: "NOT_FOUND", message: "\u0627\u0644\u062F\u0631\u0633 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
      await requireTeacherGroup(db, lesson[0].groupId, ctx.user.id);
      const students = await db.select({ id: users.id, name: users.name, email: users.email }).from(groupStudents).innerJoin(users, eq7(groupStudents.studentUserId, users.id)).where(eq7(groupStudents.groupId, lesson[0].groupId)).orderBy(users.name);
      const session = await db.select().from(attendanceSessions).where(eq7(attendanceSessions.lessonId, input.lessonId)).limit(1);
      const records = session[0] ? await db.select().from(attendanceRecords).where(eq7(attendanceRecords.attendanceSessionId, session[0].id)) : [];
      return { lesson: lesson[0], students, records };
    }),
    save: teacherProcedure.input(z6.object({ lessonId: z6.number().int().positive(), records: z6.array(z6.object({ studentUserId: z6.number().int().positive(), status: attendanceStatus })).min(1) })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const lesson = await db.select().from(lessons).where(eq7(lessons.id, input.lessonId)).limit(1);
      if (!lesson[0]) throw new TRPCError8({ code: "NOT_FOUND", message: "\u0627\u0644\u062F\u0631\u0633 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
      await requireTeacherGroup(db, lesson[0].groupId, ctx.user.id);
      const students = await db.select({ studentUserId: groupStudents.studentUserId }).from(groupStudents).where(eq7(groupStudents.groupId, lesson[0].groupId));
      const enrolledIds = new Set(students.map((student) => student.studentUserId));
      if (!isCompleteAttendanceBatch(Array.from(enrolledIds), input.records.map((record) => record.studentUserId))) {
        throw new TRPCError8({ code: "BAD_REQUEST", message: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u062D\u0627\u0644\u0629 \u0643\u0644 \u0637\u0627\u0644\u0628 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629 \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629 \u0641\u0642\u0637." });
      }
      await db.transaction(async (tx) => {
        const existing = await tx.select().from(attendanceSessions).where(eq7(attendanceSessions.lessonId, input.lessonId)).limit(1);
        let sessionId = existing[0]?.id;
        if (!sessionId) {
          const inserted = await tx.insert(attendanceSessions).values({ lessonId: input.lessonId, groupId: lesson[0].groupId, teacherUserId: ctx.user.id });
          sessionId = Number(inserted.insertId);
        } else {
          await tx.delete(attendanceRecords).where(eq7(attendanceRecords.attendanceSessionId, sessionId));
        }
        await tx.insert(attendanceRecords).values(input.records.map((record) => ({ attendanceSessionId: sessionId, studentUserId: record.studentUserId, status: record.status })));
      });
      return { success: true };
    })
  }),
  assignments: router({
    list: teacherProcedure.input(groupIdInput).query(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireTeacherGroup(db, input.groupId, ctx.user.id);
      const assignmentRows = await db.select().from(assignments).where(eq7(assignments.groupId, input.groupId)).orderBy(desc4(assignments.createdAt));
      if (!assignmentRows.length) return [];
      const assignmentIds = assignmentRows.map((assignment) => assignment.id);
      const submissions = await db.select({ assignmentId: assignmentSubmissions.assignmentId, studentUserId: assignmentSubmissions.studentUserId, studentName: users.name, status: assignmentSubmissions.status, sentAt: assignmentSubmissions.sentAt, confirmedAt: assignmentSubmissions.confirmedAt }).from(assignmentSubmissions).innerJoin(users, eq7(assignmentSubmissions.studentUserId, users.id)).where(inArray3(assignmentSubmissions.assignmentId, assignmentIds));
      const roster = await db.select({ id: users.id, name: users.name }).from(groupStudents).innerJoin(users, eq7(groupStudents.studentUserId, users.id)).where(eq7(groupStudents.groupId, input.groupId)).orderBy(users.name);
      return assignmentRows.map((assignment) => ({ ...assignment, students: roster.map((student) => ({ ...student, submission: submissions.find((submission) => submission.assignmentId === assignment.id && submission.studentUserId === student.id) || null })) }));
    }),
    create: teacherProcedure.input(z6.object({ groupId: z6.number().int().positive(), lessonId: z6.number().int().positive().nullable().optional(), title: z6.string().trim().min(2).max(240), instructions: z6.string().trim().min(3).max(8e3), dueAt: datetimeInput.nullable().optional(), isPublished: z6.boolean().default(true) })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireTeacherGroup(db, input.groupId, ctx.user.id);
      if (input.lessonId) {
        const lesson = await db.select({ id: lessons.id }).from(lessons).where(and5(eq7(lessons.id, input.lessonId), eq7(lessons.groupId, input.groupId))).limit(1);
        if (!lesson[0]) throw new TRPCError8({ code: "BAD_REQUEST", message: "\u0627\u0644\u062F\u0631\u0633 \u0627\u0644\u0645\u062D\u062F\u062F \u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0625\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629." });
      }
      await db.insert(assignments).values({ ...input, teacherUserId: ctx.user.id, dueAt: input.dueAt ? new Date(input.dueAt) : null });
      return { success: true };
    }),
    update: teacherProcedure.input(z6.object({ id: z6.number().int().positive(), title: z6.string().trim().min(2).max(240).optional(), instructions: z6.string().trim().min(3).max(8e3).optional(), dueAt: datetimeInput.nullable().optional(), isPublished: z6.boolean().optional() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const assignment = await db.select().from(assignments).where(and5(eq7(assignments.id, input.id), eq7(assignments.teacherUserId, ctx.user.id))).limit(1);
      if (!assignment[0]) throw new TRPCError8({ code: "FORBIDDEN", message: "\u0627\u0644\u0648\u0627\u062C\u0628 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D." });
      const { id, dueAt, ...changes } = input;
      await db.update(assignments).set({ ...changes, ...dueAt !== void 0 ? { dueAt: dueAt ? new Date(dueAt) : null } : {} }).where(eq7(assignments.id, id));
      return { success: true };
    }),
    delete: teacherProcedure.input(z6.object({ id: z6.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.delete(assignments).where(and5(eq7(assignments.id, input.id), eq7(assignments.teacherUserId, ctx.user.id)));
      return { success: true };
    }),
    confirmSubmission: teacherProcedure.input(z6.object({ assignmentId: z6.number().int().positive(), studentUserId: z6.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const assignment = await db.select().from(assignments).where(and5(eq7(assignments.id, input.assignmentId), eq7(assignments.teacherUserId, ctx.user.id))).limit(1);
      if (!assignment[0]) throw new TRPCError8({ code: "FORBIDDEN", message: "\u0647\u0630\u0627 \u0627\u0644\u0648\u0627\u062C\u0628 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0644\u0643." });
      const enrolled = await db.select({ id: groupStudents.id }).from(groupStudents).where(and5(eq7(groupStudents.groupId, assignment[0].groupId), eq7(groupStudents.studentUserId, input.studentUserId))).limit(1);
      if (!enrolled[0]) throw new TRPCError8({ code: "FORBIDDEN", message: "\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0633\u062C\u0644 \u0641\u064A \u0645\u062C\u0645\u0648\u0639\u0629 \u0647\u0630\u0627 \u0627\u0644\u0648\u0627\u062C\u0628." });
      const submission = await db.select().from(assignmentSubmissions).where(and5(eq7(assignmentSubmissions.assignmentId, input.assignmentId), eq7(assignmentSubmissions.studentUserId, input.studentUserId))).limit(1);
      if (!submission[0]) throw new TRPCError8({ code: "CONFLICT", message: "\u0644\u0645 \u064A\u062D\u062F\u062F \u0627\u0644\u0637\u0627\u0644\u0628 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0648\u0627\u062C\u0628 \u0628\u0639\u062F." });
      await db.update(assignmentSubmissions).set({ status: "confirmed", confirmedAt: /* @__PURE__ */ new Date() }).where(eq7(assignmentSubmissions.id, submission[0].id));
      return { success: true };
    })
  }),
  exams: router({
    list: teacherProcedure.input(groupIdInput).query(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireTeacherGroup(db, input.groupId, ctx.user.id);
      return db.select().from(exams).where(eq7(exams.groupId, input.groupId)).orderBy(desc4(exams.startsAt));
    }),
    create: teacherProcedure.input(z6.object({ groupId: z6.number().int().positive(), subjectId: z6.number().int().positive(), lessonId: z6.number().int().positive().nullable().optional(), title: z6.string().trim().min(2).max(240), examType: z6.enum(["lesson", "unit", "comprehensive"]), relatedScope: z6.string().trim().max(240).nullable().optional(), durationMinutes: z6.number().int().min(1).max(360), startsAt: datetimeInput, endsAt: datetimeInput, allowedAttempts: z6.number().int().min(1).max(10).default(1), status: z6.enum(["draft", "published", "closed"]).default("draft"), questions: z6.array(questionInput).min(1).max(100) })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const group = await requireTeacherGroup(db, input.groupId, ctx.user.id);
      if (group.subjectId !== input.subjectId) throw new TRPCError8({ code: "BAD_REQUEST", message: "\u0627\u0644\u0645\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629 \u0644\u0627 \u062A\u0637\u0627\u0628\u0642 \u0645\u0627\u062F\u0629 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629." });
      if (input.lessonId) {
        const lesson = await db.select({ id: lessons.id }).from(lessons).where(and5(eq7(lessons.id, input.lessonId), eq7(lessons.groupId, input.groupId))).limit(1);
        if (!lesson[0]) throw new TRPCError8({ code: "BAD_REQUEST", message: "\u0627\u0644\u062F\u0631\u0633 \u0627\u0644\u0645\u062D\u062F\u062F \u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0625\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629." });
      }
      if (new Date(input.startsAt) >= new Date(input.endsAt)) throw new TRPCError8({ code: "BAD_REQUEST", message: "\u0648\u0642\u062A \u0628\u062F\u0621 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0633\u0628\u0642 \u0648\u0642\u062A \u0627\u0646\u062A\u0647\u0627\u0626\u0647." });
      input.questions.forEach(validateQuestion);
      const { questions, startsAt, endsAt, ...examInput } = input;
      const examId = await db.transaction(async (tx) => {
        const inserted = await tx.insert(exams).values({ ...examInput, teacherUserId: ctx.user.id, startsAt: new Date(startsAt), endsAt: new Date(endsAt) });
        const createdExamId = Number(inserted.insertId);
        await tx.insert(examQuestions).values(questions.map((question, index2) => ({ examId: createdExamId, questionType: question.questionType, prompt: question.prompt, choices: question.questionType === "multiple_choice" ? question.choices : null, correctChoiceIndex: question.questionType === "multiple_choice" ? question.correctChoiceIndex : null, sortOrder: question.sortOrder ?? index2 })));
        return createdExamId;
      });
      return { success: true, examId };
    }),
    details: teacherProcedure.input(z6.object({ examId: z6.number().int().positive() })).query(async ({ input, ctx }) => {
      const exam = await requireTeacherExam(input.examId, ctx.user.id);
      const db = await requireDb();
      const questions = await db.select().from(examQuestions).where(eq7(examQuestions.examId, input.examId)).orderBy(examQuestions.sortOrder);
      return { exam, questions };
    }),
    addQuestion: teacherProcedure.input(z6.object({ examId: z6.number().int().positive(), question: questionInput })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const exam = await requireTeacherExam(input.examId, ctx.user.id);
      if (exam.status !== "draft") throw new TRPCError8({ code: "CONFLICT", message: "\u064A\u0645\u0643\u0646 \u062A\u0639\u062F\u064A\u0644 \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0641\u064A \u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0633\u0648\u062F\u0629 \u0641\u0642\u0637." });
      validateQuestion(input.question);
      await db.insert(examQuestions).values({ examId: input.examId, questionType: input.question.questionType, prompt: input.question.prompt, choices: input.question.questionType === "multiple_choice" ? input.question.choices : null, correctChoiceIndex: input.question.questionType === "multiple_choice" ? input.question.correctChoiceIndex : null, sortOrder: input.question.sortOrder });
      return { success: true };
    }),
    attempts: teacherProcedure.input(z6.object({ examId: z6.number().int().positive() })).query(async ({ input, ctx }) => {
      await requireTeacherExam(input.examId, ctx.user.id);
      const db = await requireDb();
      return db.select({ id: examAttempts.id, attemptNumber: examAttempts.attemptNumber, status: examAttempts.status, autoScore: examAttempts.autoScore, manualScore: examAttempts.manualScore, finalScore: examAttempts.finalScore, submittedAt: examAttempts.submittedAt, studentName: users.name }).from(examAttempts).innerJoin(users, eq7(examAttempts.studentUserId, users.id)).where(eq7(examAttempts.examId, input.examId)).orderBy(desc4(examAttempts.updatedAt));
    }),
    attemptDetails: teacherProcedure.input(z6.object({ attemptId: z6.number().int().positive() })).query(async ({ input, ctx }) => {
      const db = await requireDb();
      const attempt = await db.select({ id: examAttempts.id, status: examAttempts.status, finalScore: examAttempts.finalScore, studentName: users.name, examId: exams.id, examTitle: exams.title }).from(examAttempts).innerJoin(exams, eq7(examAttempts.examId, exams.id)).innerJoin(users, eq7(examAttempts.studentUserId, users.id)).where(and5(eq7(examAttempts.id, input.attemptId), eq7(exams.teacherUserId, ctx.user.id))).limit(1);
      if (!attempt[0]) throw new TRPCError8({ code: "FORBIDDEN", message: "\u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629." });
      const answers = await db.select({ id: examAnswers.id, selectedChoiceIndex: examAnswers.selectedChoiceIndex, essayAnswer: examAnswers.essayAnswer, isCorrect: examAnswers.isCorrect, reviewedScore: examAnswers.reviewedScore, prompt: examQuestions.prompt, questionType: examQuestions.questionType, choices: examQuestions.choices, correctChoiceIndex: examQuestions.correctChoiceIndex }).from(examAnswers).innerJoin(examQuestions, eq7(examAnswers.questionId, examQuestions.id)).where(eq7(examAnswers.examAttemptId, input.attemptId)).orderBy(examQuestions.sortOrder);
      return { attempt: attempt[0], answers };
    }),
    gradeEssay: teacherProcedure.input(z6.object({ answerId: z6.number().int().positive(), score: z6.union([z6.literal(0), z6.literal(1)]) })).mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const target = await db.select({ attemptId: examAnswers.examAttemptId, examId: examAttempts.examId, questionType: examQuestions.questionType }).from(examAnswers).innerJoin(examAttempts, eq7(examAnswers.examAttemptId, examAttempts.id)).innerJoin(examQuestions, eq7(examAnswers.questionId, examQuestions.id)).where(eq7(examAnswers.id, input.answerId)).limit(1);
      if (!target[0] || target[0].questionType !== "essay") throw new TRPCError8({ code: "BAD_REQUEST", message: "\u0625\u062C\u0627\u0628\u0629 \u0627\u0644\u0633\u0624\u0627\u0644 \u0627\u0644\u0645\u0642\u0627\u0644\u064A \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629." });
      await requireTeacherExam(target[0].examId, ctx.user.id);
      await db.transaction(async (tx) => {
        await tx.update(examAnswers).set({ reviewedScore: input.score, reviewedAt: /* @__PURE__ */ new Date() }).where(eq7(examAnswers.id, input.answerId));
        const allAnswers = await tx.select({ reviewedScore: examAnswers.reviewedScore, questionType: examQuestions.questionType }).from(examAnswers).innerJoin(examQuestions, eq7(examAnswers.questionId, examQuestions.id)).where(eq7(examAnswers.examAttemptId, target[0].attemptId));
        const manualScore = allAnswers.filter((answer) => answer.questionType === "essay").reduce((sum, answer) => sum + (answer.reviewedScore || 0), 0);
        const pending = allAnswers.some((answer) => answer.questionType === "essay" && answer.reviewedScore === null);
        const attempt = await tx.select().from(examAttempts).where(eq7(examAttempts.id, target[0].attemptId)).limit(1);
        await tx.update(examAttempts).set({ manualScore, finalScore: (attempt[0]?.autoScore || 0) + manualScore, status: pending ? "submitted" : "reviewed" }).where(eq7(examAttempts.id, target[0].attemptId));
      });
      return { success: true };
    })
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  public: publicRouter,
  admin: adminRouter,
  teacher: teacherRouter,
  student: studentRouter,
  profile: profileRouter
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid as nanoid2 } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("/{*splat}", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid2()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("/{*splat}", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
var rateBuckets = /* @__PURE__ */ new Map();
function requestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwarded = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : void 0;
  return firstForwarded || req.ip || req.socket.remoteAddress || "unknown";
}
function createRateLimit(options) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${options.scope}:${requestIp(req)}`;
    const current = rateBuckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : current;
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > options.max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1e3)));
      res.status(429).json({ error: "too_many_requests", message: "\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0624\u0642\u062A \u0644\u0644\u0637\u0644\u0628\u0627\u062A. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0627\u062D\u0642\u064B\u0627." });
      return;
    }
    if (rateBuckets.size > 1e4) {
      rateBuckets.forEach((entry, bucketKey) => {
        if (entry.resetAt <= now) rateBuckets.delete(bucketKey);
      });
    }
    next();
  };
}
function requireSameOriginForMutation(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (typeof forwardedHost === "string" ? forwardedHost.split(",")[0] : void 0) || req.headers.host;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = (typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : void 0) || req.protocol;
  const expectedOrigin = host ? `${proto || "https"}://${host.trim()}` : null;
  if (typeof origin !== "string" || !expectedOrigin || origin !== expectedOrigin) {
    res.status(403).json({ error: "invalid_origin", message: "\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u0645\u0646 \u0645\u0635\u062F\u0631 \u063A\u064A\u0631 \u0645\u0648\u062B\u0648\u0642." });
    return;
  }
  next();
}
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "base-uri 'self'; frame-ancestors 'self' https://manus.im https://*.manus.im; object-src 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
    if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=15552000");
    next();
  });
  app.use(express2.json({ limit: "3mb" }));
  app.use(express2.urlencoded({ limit: "3mb", extended: true, parameterLimit: 100 }));
  registerStorageProxy(app);
  app.use("/api/oauth/callback", createRateLimit({ scope: "oauth", windowMs: 15 * 6e4, max: 20 }));
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createRateLimit({ scope: "trpc", windowMs: 6e4, max: 120 }),
    requireSameOriginForMutation,
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
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
