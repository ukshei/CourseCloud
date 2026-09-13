/**
 * routes/trash.js
 *
 * Endpoints for viewing and managing the trash (soft-deleted items).
 *
 * All routes require a verified Supabase JWT (via verifyToken middleware).
 * Ownership is enforced by scoping queries to req.user.id.
 *
 * Endpoints:
 *   GET    /api/trash              — list all trashed courses + files
 *   GET    /api/trash/courses      — list only trashed courses
 *   GET    /api/trash/files        — list only trashed files
 *   DELETE /api/trash/empty        — permanently delete ALL trashed items
 *                                    (Storage objects + DB rows)
 *
 * Individual item restore and permanent delete are handled by:
 *   PATCH  /api/courses/:id/restore       (in courses.js)
 *   DELETE /api/courses/:id/permanent     (in courses.js)
 *   PATCH  /api/files/:id/restore         (in files.js)
 *   DELETE /api/files/:id/permanent       (in files.js)
 */

const { Router } = require("express");
const supabase = require("../supabaseClient");

const router = Router();

const BUCKET = "course-files";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trash
// Returns all trashed courses and files for the authenticated user,
// merged into a single array sorted by deleted_at DESC.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const userId = req.user.id;

  const [coursesResult, filesResult] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, code, created_at, deleted_at")
      .eq("user_id", userId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),

    supabase
      .from("files")
      .select("id, course_id, file_name, file_path, created_at, deleted_at")
      .eq("user_id", userId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
  ]);

  if (coursesResult.error) {
    return res.status(500).json({ error: coursesResult.error.message });
  }
  if (filesResult.error) {
    return res.status(500).json({ error: filesResult.error.message });
  }

  const courses = (coursesResult.data || []).map((c) => ({
    ...c,
    itemType: "course",
  }));
  const files = (filesResult.data || []).map((f) => ({
    ...f,
    itemType: "file",
  }));

  const merged = [...courses, ...files].sort(
    (a, b) => new Date(b.deleted_at) - new Date(a.deleted_at)
  );

  res.json(merged);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trash/courses
// Returns only trashed courses for the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/courses", async (req, res) => {
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, code, created_at, deleted_at")
    .eq("user_id", req.user.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trash/files
// Returns only trashed files for the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/files", async (req, res) => {
  const { data, error } = await supabase
    .from("files")
    .select("id, course_id, file_name, file_path, created_at, deleted_at")
    .eq("user_id", req.user.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/trash/empty
// Permanently deletes EVERY trashed item belonging to the user:
//
//   1. Gather all trashed files — remove their Storage objects.
//   2. Gather all trashed courses — remove their remaining Storage objects
//      (active or trashed files that belong to those courses).
//   3. Delete all trashed file rows from the DB.
//   4. Delete all trashed course rows from the DB (cascade removes notes/files rows).
//
// Returns a results summary.
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/empty", async (req, res) => {
  const userId = req.user.id;

  const results = {
    deletedFiles: 0,
    deletedCourses: 0,
    storageObjectsRemoved: 0,
    errors: [],
  };

  // ── Step 1: Fetch all trashed files ────────────────────────────────────
  const { data: trashedFiles, error: filesErr } = await supabase
    .from("files")
    .select("id, file_path")
    .eq("user_id", userId)
    .not("deleted_at", "is", null);

  if (filesErr) {
    return res.status(500).json({ error: `Failed to fetch trashed files: ${filesErr.message}` });
  }

  // ── Step 2: Fetch all trashed courses ──────────────────────────────────
  const { data: trashedCourses, error: coursesErr } = await supabase
    .from("courses")
    .select("id")
    .eq("user_id", userId)
    .not("deleted_at", "is", null);

  if (coursesErr) {
    return res.status(500).json({ error: `Failed to fetch trashed courses: ${coursesErr.message}` });
  }

  // ── Step 3: Remove Storage objects for trashed files ───────────────────
  const trashFilePaths = (trashedFiles || [])
    .map((f) => f.file_path)
    .filter(Boolean);

  if (trashFilePaths.length > 0) {
    const { error: storageErr } = await supabase.storage
      .from(BUCKET)
      .remove(trashFilePaths);

    if (storageErr) {
      results.errors.push(`Storage removal for files: ${storageErr.message}`);
    } else {
      results.storageObjectsRemoved += trashFilePaths.length;
    }
  }

  // ── Step 4: Remove Storage objects for files belonging to trashed courses
  // (includes both active and trashed files under those courses)
  if (trashedCourses && trashedCourses.length > 0) {
    const courseIds = trashedCourses.map((c) => c.id);

    const { data: courseFiles } = await supabase
      .from("files")
      .select("file_path")
      .in("course_id", courseIds)
      .not("file_path", "is", null);

    // Exclude paths already handled in Step 3 to avoid duplicate removals.
    const trashFilePathSet = new Set(trashFilePaths);
    const courseFilePaths = (courseFiles || [])
      .map((f) => f.file_path)
      .filter((p) => p && !trashFilePathSet.has(p));

    if (courseFilePaths.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from(BUCKET)
        .remove(courseFilePaths);

      if (storageErr) {
        results.errors.push(
          `Storage removal for course files: ${storageErr.message}`
        );
      } else {
        results.storageObjectsRemoved += courseFilePaths.length;
      }
    }
  }

  // ── Step 5: Delete trashed file rows ───────────────────────────────────
  if (trashedFiles && trashedFiles.length > 0) {
    const fileIds = trashedFiles.map((f) => f.id);

    const { error: deleteFilesErr } = await supabase
      .from("files")
      .delete()
      .in("id", fileIds)
      .eq("user_id", userId);

    if (deleteFilesErr) {
      results.errors.push(`DB delete for files: ${deleteFilesErr.message}`);
    } else {
      results.deletedFiles = fileIds.length;
    }
  }

  // ── Step 6: Delete trashed course rows (cascades to notes + file rows) ─
  if (trashedCourses && trashedCourses.length > 0) {
    const courseIds = trashedCourses.map((c) => c.id);

    const { error: deleteCoursesErr } = await supabase
      .from("courses")
      .delete()
      .in("id", courseIds)
      .eq("user_id", userId);

    if (deleteCoursesErr) {
      results.errors.push(`DB delete for courses: ${deleteCoursesErr.message}`);
    } else {
      results.deletedCourses = courseIds.length;
    }
  }

  res.json({
    success: results.errors.length === 0,
    results,
  });
});

module.exports = router;
