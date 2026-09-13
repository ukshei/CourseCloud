/**
 * routes/courses.js
 *
 * CRUD endpoints for the `courses` table.
 *
 * All routes require a verified Supabase JWT (via verifyToken middleware).
 * Ownership is enforced by scoping every query to req.user.id.
 *
 * Endpoints:
 *   GET    /api/courses                   — list active courses (deleted_at IS NULL)
 *   POST   /api/courses                   — create a course
 *   PATCH  /api/courses/:id               — update name / code / last_accessed_at
 *   DELETE /api/courses/:id               — soft-delete (set deleted_at = now())
 *   PATCH  /api/courses/:id/restore       — restore from trash (set deleted_at = null)
 *   DELETE /api/courses/:id/permanent     — permanently delete course + its files from Storage + DB
 */

const { Router } = require("express");
const supabase = require("../supabaseClient");

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses
// Returns all active (non-deleted) courses owned by the authenticated user,
// sorted by last_accessed_at DESC (recently accessed first), then created_at DESC.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, code, last_accessed_at, created_at, deleted_at")
    .eq("user_id", req.user.id)
    .is("deleted_at", null)
    .order("last_accessed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/courses
// Body: { name: string, code: string }
// Creates a new course and returns the inserted row.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { name, code } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Course name is required." });
  }
  if (!code || !String(code).trim()) {
    return res.status(400).json({ error: "Course code is required." });
  }

  const { data, error } = await supabase
    .from("courses")
    .insert({
      name: String(name).trim(),
      code: String(code).trim(),
      user_id: req.user.id,
    })
    .select("id, name, code, last_accessed_at, created_at")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/courses/:id
// Body: { name?, code?, last_accessed_at? }  — any subset is accepted
// Updates the specified fields. Ownership is verified before update.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  const courseId = Number(req.params.id);

  if (isNaN(courseId)) {
    return res.status(400).json({ error: "Invalid course ID." });
  }

  // Build the update payload from only the fields present in the request.
  const allowed = ["name", "code", "last_accessed_at"];
  const updates = {};

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates[field] =
        field === "last_accessed_at"
          ? req.body[field]
          : String(req.body[field]).trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No valid fields provided for update." });
  }

  const { data, error } = await supabase
    .from("courses")
    .update(updates)
    .eq("id", courseId)
    .eq("user_id", req.user.id) // enforce ownership
    .select("id, name, code, last_accessed_at, created_at, deleted_at")
    .single();

  if (error) {
    // PostgREST returns PGRST116 when no rows match — means not found or wrong owner
    if (error.code === "PGRST116") {
      return res.status(404).json({ error: "Course not found or access denied." });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/courses/:id
// Soft-delete: sets deleted_at = now(). The course moves to the Trash.
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const courseId = Number(req.params.id);

  if (isNaN(courseId)) {
    return res.status(400).json({ error: "Invalid course ID." });
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("courses")
    .update({ deleted_at: now })
    .eq("id", courseId)
    .eq("user_id", req.user.id)
    .select("id, deleted_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return res.status(404).json({ error: "Course not found or access denied." });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ id: data.id, deleted_at: data.deleted_at });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/courses/:id/restore
// Restores a soft-deleted course by clearing deleted_at.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/restore", async (req, res) => {
  const courseId = Number(req.params.id);

  if (isNaN(courseId)) {
    return res.status(400).json({ error: "Invalid course ID." });
  }

  const { data, error } = await supabase
    .from("courses")
    .update({ deleted_at: null })
    .eq("id", courseId)
    .eq("user_id", req.user.id)
    .select("id, name, code, last_accessed_at, created_at, deleted_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return res.status(404).json({ error: "Course not found or access denied." });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/courses/:id/permanent
// Permanently deletes a course and ALL associated data:
//   1. Fetches all file Storage paths for this course.
//   2. Removes Storage objects from the "course-files" bucket.
//   3. Deletes the course row from the DB (cascades to notes + files rows).
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id/permanent", async (req, res) => {
  const courseId = Number(req.params.id);

  if (isNaN(courseId)) {
    return res.status(400).json({ error: "Invalid course ID." });
  }

  // Verify ownership first by selecting the course.
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("user_id", req.user.id)
    .single();

  if (courseErr || !course) {
    return res.status(404).json({ error: "Course not found or access denied." });
  }

  // Gather all Storage file paths belonging to this course (active + trashed).
  const { data: courseFiles } = await supabase
    .from("files")
    .select("file_path")
    .eq("course_id", courseId);

  const storagePaths = (courseFiles || [])
    .map((f) => f.file_path)
    .filter(Boolean);

  // Remove Storage objects before deleting the DB rows.
  if (storagePaths.length > 0) {
    const { error: storageErr } = await supabase.storage
      .from("course-files")
      .remove(storagePaths);

    if (storageErr) {
      // Log but do not abort — Storage may already have been cleaned.
      console.error(
        `[courses] Storage removal warning for course ${courseId}:`,
        storageErr.message
      );
    }
  }

  // Delete the course row. DB cascade removes associated notes and files rows.
  const { error: deleteErr } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId)
    .eq("user_id", req.user.id);

  if (deleteErr) {
    return res.status(500).json({ error: deleteErr.message });
  }

  res.json({ success: true, id: courseId });
});

module.exports = router;
