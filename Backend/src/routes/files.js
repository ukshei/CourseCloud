/**
 * routes/files.js
 *
 * Endpoints for the `files` table + Supabase Storage ("course-files" bucket).
 *
 * All routes require a verified Supabase JWT (via verifyToken middleware).
 * Ownership is enforced by scoping queries to req.user.id.
 *
 * File uploads use multer with memoryStorage — the file bytes are buffered
 * in RAM and then streamed to Supabase Storage. Suitable for typical
 * course documents (PDFs, DOCX, slides, etc.).
 *
 * Endpoints:
 *   GET    /api/files                          — list all active files (all courses)
 *   GET    /api/files/:id/signed-url           — generate a signed URL (open or download)
 *   DELETE /api/files/:id                      — soft-delete (set deleted_at = now())
 *   PATCH  /api/files/:id/restore              — restore from trash
 *   DELETE /api/files/:id/permanent            — permanently delete Storage object + DB row
 *
 *   GET    /api/courses/:courseId/files        — list active files for a specific course
 *   POST   /api/courses/:courseId/files        — upload a file (multipart/form-data, field: "file")
 *
 * Note: The course-scoped routes (/api/courses/:courseId/files) are mounted
 * on this router via mergeParams so that courseId is available in req.params.
 */

const { Router } = require("express");
const multer = require("multer");
const supabase = require("../supabaseClient");

// Use in-memory storage — no temp files on disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB hard limit
  },
});

const BUCKET = "course-files";

// ─── Standalone /api/files router ─────────────────────────────────────────
const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/files
// Returns all active (non-deleted) files owned by the authenticated user
// across all their courses, ordered by created_at DESC.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("files")
    .select("id, course_id, file_name, file_path, created_at, deleted_at")
    .eq("user_id", req.user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/files/:id/signed-url
// Query params:
//   download=true  — adds Content-Disposition: attachment so the browser saves
//   download=false — browser opens the file inline (default)
//   expires=<N>    — signed URL expiry in seconds (default 60)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/signed-url", async (req, res) => {
  const fileId = Number(req.params.id);

  if (isNaN(fileId)) {
    return res.status(400).json({ error: "Invalid file ID." });
  }

  // Fetch the file record to verify ownership and get the Storage path.
  const { data: file, error: fetchErr } = await supabase
    .from("files")
    .select("id, file_name, file_path")
    .eq("id", fileId)
    .eq("user_id", req.user.id)
    .single();

  if (fetchErr || !file) {
    return res.status(404).json({ error: "File not found or access denied." });
  }

  const expiresIn = Number(req.query.expires) || 60;
  const wantDownload = req.query.download === "true";

  const signedUrlOptions = wantDownload
    ? { download: file.file_name }
    : {};

  const { data, error: urlErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.file_path, expiresIn, signedUrlOptions);

  if (urlErr) {
    return res.status(500).json({ error: urlErr.message });
  }

  res.json({ signedUrl: data.signedUrl, expiresIn });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/files/:id
// Soft-delete: sets deleted_at = now(). The file moves to the Trash.
// The actual Storage object is NOT removed here — it is removed only on
// permanent delete or when the cleanup-trash edge function runs.
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const fileId = Number(req.params.id);

  if (isNaN(fileId)) {
    return res.status(400).json({ error: "Invalid file ID." });
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("files")
    .update({ deleted_at: now })
    .eq("id", fileId)
    .eq("user_id", req.user.id)
    .select("id, deleted_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return res.status(404).json({ error: "File not found or access denied." });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({ id: data.id, deleted_at: data.deleted_at });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/files/:id/restore
// Restores a soft-deleted file by clearing deleted_at.
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/restore", async (req, res) => {
  const fileId = Number(req.params.id);

  if (isNaN(fileId)) {
    return res.status(400).json({ error: "Invalid file ID." });
  }

  const { data, error } = await supabase
    .from("files")
    .update({ deleted_at: null })
    .eq("id", fileId)
    .eq("user_id", req.user.id)
    .select("id, course_id, file_name, file_path, created_at, deleted_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return res.status(404).json({ error: "File not found or access denied." });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/files/:id/permanent
// Permanently deletes a file:
//   1. Removes the object from Supabase Storage.
//   2. Deletes the DB row.
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id/permanent", async (req, res) => {
  const fileId = Number(req.params.id);

  if (isNaN(fileId)) {
    return res.status(400).json({ error: "Invalid file ID." });
  }

  // Verify ownership and get Storage path.
  const { data: file, error: fetchErr } = await supabase
    .from("files")
    .select("id, file_path")
    .eq("id", fileId)
    .eq("user_id", req.user.id)
    .single();

  if (fetchErr || !file) {
    return res.status(404).json({ error: "File not found or access denied." });
  }

  // Remove from Storage first.
  if (file.file_path) {
    const { error: storageErr } = await supabase.storage
      .from(BUCKET)
      .remove([file.file_path]);

    if (storageErr) {
      console.error(
        `[files] Storage removal warning for file ${fileId}:`,
        storageErr.message
      );
      // Do not abort — continue to remove the DB row.
    }
  }

  // Delete the DB row.
  const { error: deleteErr } = await supabase
    .from("files")
    .delete()
    .eq("id", fileId)
    .eq("user_id", req.user.id);

  if (deleteErr) {
    return res.status(500).json({ error: deleteErr.message });
  }

  res.json({ success: true, id: fileId });
});

// ─── Course-scoped file routes (/api/courses/:courseId/files) ─────────────
// Mounted separately in server.js via a Router with mergeParams: true.
const courseFilesRouter = Router({ mergeParams: true });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/courses/:courseId/files
// Returns active files for a specific course. Verifies the course belongs
// to the authenticated user before returning any data.
// ─────────────────────────────────────────────────────────────────────────────
courseFilesRouter.get("/", async (req, res) => {
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
    .from("files")
    .select("id, course_id, file_name, file_path, created_at, deleted_at")
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/courses/:courseId/files
// Content-Type: multipart/form-data
// Form field: "file" (binary)
//
// Flow:
//   1. Verify the course belongs to the user.
//   2. Upload the file buffer to Supabase Storage at path:
//      {courseId}/{timestamp}-{originalname}
//   3. Insert a record in the `files` table.
//   4. On DB insert failure, roll back the Storage upload.
// ─────────────────────────────────────────────────────────────────────────────
courseFilesRouter.post("/", upload.single("file"), async (req, res) => {
  const courseId = Number(req.params.courseId);

  if (isNaN(courseId)) {
    return res.status(400).json({ error: "Invalid course ID." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded. Use field name 'file'." });
  }

  // Verify course ownership.
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("user_id", req.user.id)
    .single();

  if (courseErr || !course) {
    return res.status(404).json({ error: "Course not found or access denied." });
  }

  // Build the Storage path in the same format as the frontend:
  // {courseId}/{timestamp}-{originalFilename}
  const sanitizedName = req.file.originalname.replace(/[^a-zA-Z0-9._\-\s]/g, "_");
  const filePath = `${courseId}/${Date.now()}-${sanitizedName}`;

  // Upload to Supabase Storage.
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });

  if (uploadErr) {
    return res.status(500).json({ error: `Storage upload failed: ${uploadErr.message}` });
  }

  // Insert the DB record.
  const { data: fileRecord, error: dbErr } = await supabase
    .from("files")
    .insert({
      course_id: courseId,
      file_name: req.file.originalname,
      file_path: filePath,
      user_id: req.user.id,
    })
    .select("id, course_id, file_name, file_path, created_at")
    .single();

  if (dbErr) {
    // Roll back the Storage upload to avoid orphaned objects.
    await supabase.storage.from(BUCKET).remove([filePath]);
    return res.status(500).json({
      error: `DB record failed (storage upload was rolled back): ${dbErr.message}`,
    });
  }

  res.status(201).json(fileRecord);
});

module.exports = { router, courseFilesRouter };
