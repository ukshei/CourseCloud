import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET_NAME = "course-files";

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const cleanupAuthSecret = Deno.env.get("CLEANUP_AUTH_SECRET");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase service environment variables" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!cleanupAuthSecret) {
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: CLEANUP_AUTH_SECRET is not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AUTHORIZATION CHECK
    // The endpoint accepts ONLY:
    //   Authorization: Bearer <CLEANUP_AUTH_SECRET>
    // Service-role key is NOT accepted as the HTTP caller secret.
    // =========================================================================
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token || token !== cleanupAuthSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing CLEANUP_AUTH_SECRET" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // INTERNAL ADMIN CLIENT
    // Uses SUPABASE_SERVICE_ROLE_KEY internally to perform privileged Storage/DB ops
    // =========================================================================
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const results = {
      deletedFiles: 0,
      deletedCourses: 0,
      failedFiles: 0,
      storageObjectsRemoved: 0,
    };

    // =========================================================================
    // 1. EXPIRED FILES CLEANUP (files where deleted_at < 24 hours ago)
    // =========================================================================
    const { data: expiredFiles, error: fetchFilesErr } = await supabase
      .from("files")
      .select("id, file_path, file_name")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoff);

    if (fetchFilesErr) {
      throw new Error(`Failed to fetch expired files: ${fetchFilesErr.message}`);
    }

    for (const file of expiredFiles || []) {
      try {
        // Step 1a: Remove object from Supabase Storage first
        if (file.file_path) {
          const { error: storageErr } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([file.file_path]);

          if (storageErr) {
            console.error(`Storage delete error for ${file.file_path}:`, storageErr.message);
            // Skip database deletion so the reference isn't lost prematurely
            results.failedFiles++;
            continue;
          }
          results.storageObjectsRemoved++;
        }

        // Step 1b: Delete database row only after storage file is successfully removed
        const { error: dbErr } = await supabase
          .from("files")
          .delete()
          .eq("id", file.id);

        if (dbErr) {
          console.error(`DB delete error for file id ${file.id}:`, dbErr.message);
          results.failedFiles++;
        } else {
          results.deletedFiles++;
        }
      } catch (err) {
        console.error(`Failed processing file ${file.id}:`, err);
        results.failedFiles++;
      }
    }

    // =========================================================================
    // 2. EXPIRED COURSES CLEANUP (courses where deleted_at < 24 hours ago)
    // =========================================================================
    const { data: expiredCourses, error: fetchCoursesErr } = await supabase
      .from("courses")
      .select("id, name")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoff);

    if (fetchCoursesErr) {
      throw new Error(`Failed to fetch expired courses: ${fetchCoursesErr.message}`);
    }

    for (const course of expiredCourses || []) {
      try {
        // Step 2a: Find all files (active or trashed) belonging to this course
        const { data: courseFiles } = await supabase
          .from("files")
          .select("file_path")
          .eq("course_id", course.id);

        const pathsToRemove = (courseFiles || [])
          .map((f: { file_path: string }) => f.file_path)
          .filter(Boolean);

        // Remove storage files before course deletion
        if (pathsToRemove.length > 0) {
          const { error: storageErr } = await supabase.storage
            .from(BUCKET_NAME)
            .remove(pathsToRemove);

          if (storageErr) {
            console.error(`Storage removal failed for course ${course.id}:`, storageErr.message);
            continue; // Do not delete course row if storage cleanup failed
          }
          results.storageObjectsRemoved += pathsToRemove.length;
        }

        // Step 2b: Delete the course (cascades to notes and files rows safely)
        const { error: courseDbErr } = await supabase
          .from("courses")
          .delete()
          .eq("id", course.id);

        if (courseDbErr) {
          console.error(`DB delete error for course ${course.id}:`, courseDbErr.message);
        } else {
          results.deletedCourses++;
        }
      } catch (err) {
        console.error(`Failed processing course ${course.id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, timestamp: new Date().toISOString(), results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
