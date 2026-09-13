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
 * Generic fetch wrapper for course REST API requests.
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

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

/**
 * Fetch all active courses for the authenticated user.
 * GET /api/courses
 */
export async function getCourses() {
  return request("/courses", { method: "GET" });
}

/**
 * Create a new course.
 * POST /api/courses
 */
export async function createCourse({ name, code }) {
  return request("/courses", {
    method: "POST",
    body: JSON.stringify({ name, code }),
  });
}

/**
 * Update course details or last_accessed_at.
 * PATCH /api/courses/:id
 */
export async function updateCourse(id, updates) {
  return request(`/courses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/**
 * Soft-delete a course (move to Trash).
 * DELETE /api/courses/:id
 */
export async function deleteCourse(id) {
  return request(`/courses/${id}`, {
    method: "DELETE",
  });
}
