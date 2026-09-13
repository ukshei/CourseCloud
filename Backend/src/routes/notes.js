/**
 * routes/notes.js
 *
 * CRUD endpoints for the `notes` table.
 *
 * All routes require a verified Supabase JWT (via verifyToken middleware).
 * Ownership is enforced by scoping queries to req.user.id.
 *
 * Notes use hard-delete (no trash/soft-delete) — this matches the
 * frontend behaviour where deleting a note is immediate and permanent.
 *
 * Endpoints:
 *   GET    /api/notes                        — list all notes (all courses), newest first
 *   POST   /api/notes                        — create a note
 *   PATCH  /api/notes/:id                    — update title / content / course_id
 *   DELETE /api/notes/:id                    — permanently delete a note
 *
 *   GET    /api/courses/:courseId/notes      — list notes for a specific course
 */

const { Router } = require("express");
const supabase = require("../supabaseClient");

// ─── Standalone /api/notes router ─────────────────────────────────────────
const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notes
// Returns all notes owned by the authenticated user, ordered newest first.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("notes")
    .select("id, course_id, title, content, created_at")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notes
// Body: { course_id: number, title: string, content?: string }
// Creates a new note and returns the inserted row.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { course_id, title, content } = req.body;

  if (!course_id || isNaN(Number(course_id))) {
    return res.status(400).json({ error: "A valid course_id is required." });
  }
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "Note title is required." });
  }

  const courseId = Number(course_id);

  // Verify the target course belongs to the user.
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("user_id", req.user.id)
    .single();

  if (courseErr || !course) {
    return res.status(404).json({ error: "Course not found or access denied." });
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      course_id: courseId,
      title: String(title).trim(),
      content: content ?? "",
      user_id: req.user.id,
    })
    .select("id, course_id, title, content, created_at")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/notes/:id
// Body: { title?, content?, course_id? }  — any subset is accepted
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  const noteId = Number(req.params.id);

  if (isNaN(noteId)) {
    return res.status(400).json({ error: "Invalid note ID." });
  }

  const updates = {};

  if (req.body.title !== undefined) {
    const trimmed = String(req.body.title).trim();
    if (!trimmed) {
      return res.status(400).json({ error: "Note title cannot be empty." });
    }
    updates.title = trimmed;
  }

  if (req.body.content !== undefined) {
    updates.content = req.body.content;
  }

  if (req.body.course_id !== undefined) {
    const newCourseId = Number(req.body.course_id);
    if (isNaN(newCourseId)) {
      return res.status(400).json({ error: "Invalid course_id." });
    }

    // Verify the new course belongs to the user.
    const { data: course, error: courseErr } = await supabase
      .from("courses")
      .select("id")
      .eq("id", newCourseId)
      .eq("user_id", req.user.id)
      .single();

    if (courseErr || !course) {
      return res.status(404).json({ error: "Target course not found or access denied." });
    }

    updates.course_id = newCourseId;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No valid fields provided for update." });
  }

  const { data, error } = await supabase
    .from("notes")
    .update(updates)
    .eq("id", noteId)
    .eq("user_id", req.user.id) // enforce ownership
    .select("id, course_id, title, content, created_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return res.status(404).json({ error: "Note not found or access denied." });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/notes/:id
// Hard delete — notes have no trash/restore cycle.
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const noteId = Number(req.params.id);

  if (isNaN(noteId)) {
    return res.status(400).json({ error: "Invalid note ID." });
  }

  // Verify ownership before deleting.
  const { data: note, error: fetchErr } = await supabase
    .from("notes")
    .select("id")
    .eq("id", noteId)
    .eq("user_id", req.user.id)
    .single();

  if (fetchErr || !note) {
    return res.status(404).json({ error: "Note not found or access denied." });
  }

  const { error: deleteErr } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", req.user.id);

  if (deleteErr) {
    return res.status(500).json({ error: deleteErr.message });
  }

  res.status(204).send();
});

// ─── Course-scoped notes routes (/api/courses/:courseId/notes) ─────────────
// Mounted with mergeParams: true in server.js.
const courseNotesRouter = Router({ mergeParams: true });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses/:courseId/notes
// Returns notes for a specific course, ordered newest first.
// ─────────────────────────────────────────────────────────────────────────────
courseNotesRouter.get("/", async (req, res) => {
  const courseId = Number(req.params.courseId);

  if (isNaN(courseId)) {
    return res.status(400).json({ error: "Invalid course ID." });
  }

  // Verify the course belongs to the user.
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("user_id", req.user.id)
    .single();

  if (courseErr || !course) {
    return res.status(404).json({ error: "Course not found or access denied." });
  }

  const { data, error } = await supabase
    .from("notes")
    .select("id, course_id, title, content, created_at")
    .eq("course_id", courseId)
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

module.exports = { router, courseNotesRouter };
