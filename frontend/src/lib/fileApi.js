import { supabase } from "./supabaseClient";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? "http://localhost:4000/api"
    : "https://coursecloud-tr8o.onrender.com/api");

/**
 * Retrieves the current Supabase session access token.
 */
async function getAuthToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("User is not authenticated or session has expired.");
  }

  return session.access_token;
}

/**
 * Generic fetch wrapper for JSON requests.
 */
async function request(endpoint, options = {}) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

/**
 * Fetch all active files for the authenticated user across all courses.
 * GET /api/files
 */
export async function getFiles() {
  return request("/files", { method: "GET" });
}

/**
 * Fetch active files for a specific course.
 * GET /api/courses/:courseId/files
 */
export async function getCourseFiles(courseId) {
  return request(`/courses/${courseId}/files`, { method: "GET" });
}

/**
 * Upload a file for a specific course.
 * POST /api/courses/:courseId/files (multipart/form-data)
 */
export async function uploadCourseFile(courseId, file) {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/courses/${courseId}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // Note: Do NOT set Content-Type header; fetch sets boundary automatically.
    },
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error || `Upload failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

/**
 * Generate a signed URL to open or download a file.
 * GET /api/files/:id/signed-url?download=true|false&expires=60
 */
export async function getFileSignedUrl(id, { download = false, expires = 60 } = {}) {
  const query = new URLSearchParams({
    download: String(download),
    expires: String(expires),
  });

  return request(`/files/${id}/signed-url?${query.toString()}`, {
    method: "GET",
  });
}

/**
 * Soft-delete a file (move to Trash).
 * DELETE /api/files/:id
 */
export async function deleteFile(id) {
  return request(`/files/${id}`, {
    method: "DELETE",
  });
}

/**
 * Restore a soft-deleted file from Trash.
 * PATCH /api/files/:id/restore
 */
export async function restoreFile(id) {
  return request(`/files/${id}/restore`, {
    method: "PATCH",
  });
}

/**
 * Permanently delete a file from Storage and Database.
 * DELETE /api/files/:id/permanent
 */
export async function deleteFilePermanently(id) {
  return request(`/files/${id}/permanent`, {
    method: "DELETE",
  });
}
