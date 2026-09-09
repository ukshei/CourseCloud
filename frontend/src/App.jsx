import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import CourseCard from "./components/CourseCard";
import CoursePage from "./pages/CoursePage";
import CoursesPage from "./pages/CoursesPage";
import AuthPage from "./pages/AuthPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import "./App.css";

// -------------------------
// DASHBOARD — Recently Used
// -------------------------

function Dashboard({ courses, coursesLoading, coursesError, onEditCourse, onDeleteCourse }) {
  const navigate = useNavigate();

  // Derive up to 3 dashboard courses from the shared courses array:
  // 1. Courses with last_accessed_at DESC (opened courses first)
  // 2. Then by created_at DESC (newest never-opened courses)
  // 3. Limit 3
  const recentCourses = useMemo(() => {
    return [...courses]
      .sort((a, b) => {
        // Both have last_accessed_at — sort newest first
        if (a.last_accessed_at && b.last_accessed_at) {
          return new Date(b.last_accessed_at) - new Date(a.last_accessed_at);
        }
        // a has it, b doesn't — a goes first
        if (a.last_accessed_at) return -1;
        // b has it, a doesn't — b goes first
        if (b.last_accessed_at) return 1;
        // Neither has last_accessed_at — sort by created_at newest first
        return new Date(b.created_at) - new Date(a.created_at);
      })
      .slice(0, 3);
  }, [courses]);

  // -------------------------
  // EDIT COURSE (Dashboard)
  // -------------------------

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editingCourse, setEditingCourse] = useState(false);
  const [editError, setEditError] = useState("");

  function handleEditCourse(courseId) {
    const course = courses.find((c) => c.id === courseId);
    if (course) {
      setEditingCourseId(courseId);
      setEditName(course.name);
      setEditCode(course.code);
      setEditError("");
      setShowEditModal(true);
    }
  }

  async function handleSaveChanges(event) {
    event.preventDefault();
    setEditError("");

    if (!editName.trim() || !editCode.trim()) {
      setEditError("Please enter both course name and code.");
      return;
    }

    setEditingCourse(true);

    const { error: updateError } = await supabase
      .from("courses")
      .update({
        name: editName.trim(),
        code: editCode.trim(),
      })
      .eq("id", editingCourseId);

    if (updateError) {
      setEditError(`Failed to update course: ${updateError.message}`);
      setEditingCourse(false);
      return;
    }

    // Update the shared courses state immediately — no re-fetch needed.
    onEditCourse(editingCourseId, { name: editName.trim(), code: editCode.trim() });

    setEditName("");
    setEditCode("");
    setEditingCourseId(null);
    setShowEditModal(false);
    setEditingCourse(false);
  }

  function handleCancelEdit() {
    setEditName("");
    setEditCode("");
    setEditError("");
    setEditingCourseId(null);
    setShowEditModal(false);
  }

  // -------------------------
  // DELETE COURSE (Dashboard)
  // -------------------------

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState(null);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function handleDeleteCourse(courseId) {
    setDeletingCourseId(courseId);
    setDeleteError("");
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    setDeleteError("");
    setDeletingCourse(true);

    const { error: deleteErr } = await supabase
      .from("courses")
      .delete()
      .eq("id", deletingCourseId);

    if (deleteErr) {
      setDeleteError(`Failed to delete course: ${deleteErr.message}`);
      setDeletingCourse(false);
      return;
    }

    // Remove from shared courses state immediately.
    onDeleteCourse(deletingCourseId);

    setDeletingCourseId(null);
    setShowDeleteModal(false);
    setDeletingCourse(false);
  }

  function handleCancelDelete() {
    setDeleteError("");
    setDeletingCourseId(null);
    setShowDeleteModal(false);
  }

  // -------------------------
  // RENDER
  // -------------------------

  return (
    <div className="app">
      <Header />

      <main className="contents">
        <div className="dashboard-header">
          <div>
            <h1>Welcome Back,</h1>
            <p>Student workspace</p>
          </div>
        </div>

        {coursesLoading && <p>Loading recent courses...</p>}

        {coursesError && (
          <p>Unable to load recent courses: {coursesError}</p>
        )}

        {!coursesLoading && !coursesError && courses.length === 0 && (
          <div className="dashboard-empty-state">
            <h2 className="dashboard-empty-title">Welcome to CourseCloud</h2>
            <p className="dashboard-empty-message">
              You haven&rsquo;t created any courses yet.
            </p>
            <button
              className="dashboard-get-started-button"
              onClick={() => navigate("/courses")}
            >
              Get Started
            </button>
          </div>
        )}

        {!coursesLoading && !coursesError && recentCourses.length > 0 && (
          <>
            <div className="dashboard-recent-header">
              <span className="dashboard-recent-label">Recently Used</span>
              <button
                className="dashboard-view-all-button"
                onClick={() => navigate("/courses")}
              >
                View All Courses →
              </button>
            </div>

            <div className="coursegrid">
              {recentCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  id={course.id}
                  name={course.name}
                  code={course.code}
                  onEdit={handleEditCourse}
                  onDelete={handleDeleteCourse}
                />
              ))}
            </div>
          </>
        )}

        {/* EDIT MODAL */}
        {showEditModal && (
          <div className="modal-overlay" onClick={handleCancelEdit}>
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <h2>Edit Course</h2>

              {editError && <div className="modal-error">{editError}</div>}

              <form onSubmit={handleSaveChanges}>
                <div className="modal-field">
                  <label htmlFor="dashboard-edit-name">Course Name</label>
                  <input
                    id="dashboard-edit-name"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g., Introduction to Computer Science"
                    disabled={editingCourse}
                  />
                </div>

                <div className="modal-field">
                  <label htmlFor="dashboard-edit-code">Course Code</label>
                  <input
                    id="dashboard-edit-code"
                    type="text"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    placeholder="e.g., CS101"
                    disabled={editingCourse}
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={editingCourse}
                    className="modal-cancel-button"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editingCourse}
                    className="modal-submit-button"
                  >
                    {editingCourse ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DELETE MODAL */}
        {showDeleteModal && (
          <div className="modal-overlay" onClick={handleCancelDelete}>
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <h2>Delete this course?</h2>

              <p className="modal-warning">
                This will permanently delete the course and all of its
                associated files and notes.
              </p>

              {deleteError && (
                <div className="modal-error">{deleteError}</div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  disabled={deletingCourse}
                  className="modal-cancel-button"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deletingCourse}
                  className="modal-delete-button"
                >
                  {deletingCourse ? "Deleting..." : "Delete Course"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// -------------------------
// APP ROOT
// -------------------------

function App() {
  // Single authoritative course list for the authenticated user.
  // All pages (Dashboard, CoursesPage, CoursePage) derive their view from this.
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState("");

  // Fetch all courses from Supabase (includes last_accessed_at for Dashboard ordering).
  const fetchCourses = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("courses")
      .select("id, name, code, last_accessed_at, created_at");

    if (fetchError) {
      setCoursesError(fetchError.message);
    } else {
      setCourses(data ?? []);
      setCoursesError("");
    }
    setCoursesLoading(false);
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // -------------------------
  // SHARED COURSE MUTATIONS
  // These update the local courses array immediately after a successful
  // Supabase operation — no re-fetch needed, no stale state across pages.
  // -------------------------

  // Update a course's fields in-place.
  const handleEditCourse = useCallback((courseId, updates) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, ...updates } : c))
    );
  }, []);

  // Remove a course from the list.
  const handleDeleteCourse = useCallback((courseId) => {
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
  }, []);

  // Add a newly created course to the list.
  const handleAddCourse = useCallback((newCourse) => {
    setCourses((prev) => [...prev, newCourse]);
  }, []);

  // Update last_accessed_at for a course (called when CoursePage opens).
  const handleAccessCourse = useCallback((courseId, timestamp) => {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId ? { ...c, last_accessed_at: timestamp } : c
      )
    );
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />

        {/* Dashboard — derives recentCourses from shared courses state */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard
                courses={courses}
                coursesLoading={coursesLoading}
                coursesError={coursesError}
                onEditCourse={handleEditCourse}
                onDeleteCourse={handleDeleteCourse}
              />
            </ProtectedRoute>
          }
        />

        {/* Full course management */}
        <Route
          path="/courses"
          element={
            <ProtectedRoute>
              <CoursesPage
                courses={courses}
                loading={coursesLoading}
                error={coursesError}
                onAddCourse={handleAddCourse}
                onEditCourse={handleEditCourse}
                onDeleteCourse={handleDeleteCourse}
              />
            </ProtectedRoute>
          }
        />

        {/* Individual course */}
        <Route
          path="/courses/:courseId"
          element={
            <ProtectedRoute>
              <CoursePage
                courses={courses}
                loading={coursesLoading}
                error={coursesError}
                onEditCourse={handleEditCourse}
                onDeleteCourse={handleDeleteCourse}
                onAccessCourse={handleAccessCourse}
              />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
