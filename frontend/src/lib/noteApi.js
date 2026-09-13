import { supabase } from "./supabaseClient";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? "http://localhost:4000/api"
    : "http://coursecloud-backend.eba-4nacatym.ap-south-1.elasticbeanstalk.com/api");

/**
 * Retrieves the current Supabase session access token and constructs headers.
 */
async function getAuthHeader() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error("User is not authenticated or session has expired.");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Generic fetch wrapper for notes REST API requests.
 */
async function request(endpoint, options = {}) {
  const headers = await getAuthHeader();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
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
 * Fetch all notes owned by the authenticated user (all courses).
 * GET /api/notes
 */
export async function getNotes() {
  return request("/notes", { method: "GET" });
}

/**
 * Fetch notes for a specific course.
 * GET /api/courses/:courseId/notes
 */
export async function getCourseNotes(courseId) {
  return request(`/courses/${courseId}/notes`, { method: "GET" });
}

/**
 * Create a new note.
 * POST /api/notes
 */
export async function createNote({ course_id, title, content }) {
  return request("/notes", {
    method: "POST",
    body: JSON.stringify({ course_id, title, content }),
  });
}

/**
 * Update an existing note.
 * PATCH /api/notes/:id
 */
export async function updateNote(id, updates) {
  return request(`/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/**
 * Delete a note permanently.
 * DELETE /api/notes/:id
 */
export async function deleteNote(id) {
  return request(`/notes/${id}`, {
    method: "DELETE",
  });
}
