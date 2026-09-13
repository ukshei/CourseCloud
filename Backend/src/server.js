/**
 * server.js
 *
 * CourseCloud REST API — Express application entry point.
 *
 * Architecture:
 *   - All /api/* routes are protected by the verifyToken middleware.
 *   - Routes are modular: courses, files, notes, trash each live in src/routes/.
 *   - Course-scoped sub-resources (/api/courses/:courseId/files|notes) are
 *     mounted with mergeParams: true so route params are accessible in handlers.
 *   - The Supabase service-role client is a singleton (src/supabaseClient.js).
 *   - express-async-errors patches Express so unhandled async rejections are
 *     caught by the global error handler without wrapping every handler in try/catch.
 *
 * Environment variables required (see .env.example):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   PORT           (default: 4000)
 *   FRONTEND_URL   (default: http://localhost:5173)
 */

require("dotenv").config();
require("express-async-errors");

if (process.argv.includes("--production")) {
  process.env.NODE_ENV = "production";
}

const express = require("express");
const cors = require("cors");

const { verifyToken } = require("./middleware/auth");
const coursesRouter = require("./routes/courses");
const { router: filesRouter, courseFilesRouter } = require("./routes/files");
const { router: notesRouter, courseNotesRouter } = require("./routes/notes");
const trashRouter = require("./routes/trash");

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";

// Normalize allowed origins from FRONTEND_URL (supports single origin or comma-separated list)
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl, health checks)
      if (!origin) return callback(null, true);

      const normalized = origin.replace(/\/+$/, "");
      if (allowedOrigins.includes("*") || allowedOrigins.includes(normalized)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Parse JSON bodies for non-multipart requests.
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK (unauthenticated)
// GET /health → { status: "ok", timestamp: "..." }
// ─────────────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED ROUTES
// All /api/* routes require a valid Supabase Bearer token.
// ─────────────────────────────────────────────────────────────────────────────

// ── Trash (must be mounted BEFORE courses so /api/trash/courses|files
//    is not shadowed by /api/courses/:id)
app.use("/api/trash", verifyToken, trashRouter);

// ── Courses (includes /restore and /permanent sub-routes)
app.use("/api/courses", verifyToken, coursesRouter);

// ── Course-scoped file routes: /api/courses/:courseId/files
const courseFilesParent = express.Router({ mergeParams: true });
courseFilesParent.use("/:courseId/files", verifyToken, courseFilesRouter);
app.use("/api/courses", courseFilesParent);

// ── Course-scoped note routes: /api/courses/:courseId/notes
const courseNotesParent = express.Router({ mergeParams: true });
courseNotesParent.use("/:courseId/notes", verifyToken, courseNotesRouter);
app.use("/api/courses", courseNotesParent);

// ── Standalone files: /api/files (list all, signed-url, restore, permanent)
app.use("/api/files", verifyToken, filesRouter);

// ── Standalone notes: /api/notes (list all, create, update, delete)
app.use("/api/notes", verifyToken, notesRouter);

// ─────────────────────────────────────────────────────────────────────────────
// 404 HANDLER — catch any unmatched routes
// ─────────────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// Catches any error thrown (sync or async) in a route handler.
// express-async-errors ensures async errors reach this handler automatically.
// ─────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[error]", err);

  // Multer specific errors (e.g. file too large)
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large. Maximum size is 50 MB." });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error.";
  res.status(status).json({ error: message });
});

// ─────────────────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`\nCourseCloud API running on http://${HOST}:${PORT}`);
  console.log(`  Allowed CORS origins: ${allowedOrigins.join(", ")}`);
  console.log(`  Health check:         http://${HOST}:${PORT}/health\n`);
});

module.exports = app;
