import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Header from "./components/Header";
import CourseCard from "./components/CourseCard";
import CoursePage from "./pages/CoursePage";
import CoursesPage from "./pages/CoursesPage";
import NotesPage from "./pages/NotesPage";
import FilesPage from "./pages/FilesPage";
import SettingsPage from "./pages/SettingsPage";
import TrashPage from "./pages/TrashPage";
import AuthPage from "./pages/AuthPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { supabase } from "./lib/supabaseClient";
import { getCourses, updateCourse, deleteCourse } from "./lib/courseApi";
import "./App.css";

// -------------------------
// DASHBOARD — Recently Used
// -------------------------

function Dashboard({ courses, coursesLoading, coursesError, onEditCourse, onDeleteCourse }) {
  const navigate = useNavigate();

  // Retrieve user for personalized greeting
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUser(user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const displayName =
    currentUser?.user_metadata?.display_name ||
    currentUser?.user_metadata?.full_name ||
    "";

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

    try {
      await updateCourse(editingCourseId, {
        name: editName.trim(),
        code: editCode.trim(),
      });

      // Update the shared courses state immediately — no re-fetch needed.
      onEditCourse(editingCourseId, { name: editName.trim(), code: editCode.trim() });

      setEditName("");
      setEditCode("");
      setEditingCourseId(null);
      setShowEditModal(false);
    } catch (err) {
      setEditError(`Failed to update course: ${err.message}`);
    } finally {
      setEditingCourse(false);
    }
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
  const [courseToDelete, setCourseToDelete] = useState(null);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function handleDeleteCourse(courseId) {
    const course = courses.find((c) => c.id === courseId);
    setCourseToDelete(course);
    setDeleteError("");
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    if (!courseToDelete) return;

    setDeletingCourse(true);
    setDeleteError("");

    try {
      await deleteCourse(courseToDelete.id);

      onDeleteCourse(courseToDelete.id);
      setShowDeleteModal(false);
      setCourseToDelete(null);
    } catch (err) {
      setDeleteError(`Failed to move course to Trash: ${err.message}`);
    } finally {
      setDeletingCourse(false);
    }
  }

  function handleCancelDelete() {
    setShowDeleteModal(false);
    setCourseToDelete(null);
    setDeleteError("");
  }

  // -------------------------
  // RENDER
  // -------------------------

  return (
    <div className="app">
      <Header />

      <main className="contents">
        <div className="dashboard-welcome">
          <h1>{displayName ? `Welcome back, ${displayName}` : "Welcome back"}</h1>
          <p className="dashboard-welcome-desc">
            Organize your courses, notes, and study files all in one place.
          </p>
        </div>

        {coursesLoading && <p>Loading recent courses...</p>}

        {coursesError && (
          <p>Unable to load recent courses: {coursesError}</p>
        )}

        {!coursesLoading && !coursesError && courses.length === 0 && (
          <div className="dashboard-empty-state">
            <div className="dashboard-empty-icon" aria-hidden="true">📚</div>
            <h2 className="dashboard-empty-title">No courses yet</h2>
            <p className="dashboard-empty-message">
              Create your first course to get started organizing your notes and files.
            </p>
            <button
              className="dashboard-get-started-button"
              onClick={() => navigate("/courses")}
            >
              Create a Course
            </button>
          </div>
        )}

        {!coursesLoading && !coursesError && recentCourses.length > 0 && (
          <section className="dashboard-recent-section" aria-label="Recent Courses">
            <div className="dashboard-section-header">
              <span className="dashboard-section-label">Recent Courses</span>
              <button
                className="dashboard-view-all-button"
                onClick={() => navigate("/courses")}
              >
                View all courses →
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
          </section>
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
              <h2>Move this course to Trash?</h2>

              <p className="modal-warning">
                This course will be moved to Trash and retained for 24 hours before permanent deletion.
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
                  {deletingCourse ? "Moving to Trash..." : "Move to Trash"}
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

  // Initialize saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("coursecloud_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  // Fetch all active courses via REST API (GET /api/courses).
  const fetchCourses = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setCourses([]);
      setCoursesLoading(false);
      return;
    }

    try {
      const data = await getCourses();
      setCourses(data ?? []);
      setCoursesError("");
    } catch (err) {
      setCoursesError(err.message);
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchCourses();
      } else {
        setCourses([]);
        setCoursesLoading(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
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

  // Restore a course back to the active list from Trash.
  const handleRestoreCourse = useCallback((restoredCourse) => {
    setCourses((prev) => {
      if (prev.some((c) => c.id === restoredCourse.id)) return prev;
      return [...prev, restoredCourse];
    });
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

        {/* Standalone Notes */}
        <Route
          path="/notes"
          element={
            <ProtectedRoute>
              <NotesPage courses={courses} />
            </ProtectedRoute>
          }
        />

        {/* Standalone Files */}
        <Route
          path="/files"
          element={
            <ProtectedRoute>
              <FilesPage courses={courses} />
            </ProtectedRoute>
          }
        />

        {/* Settings */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        {/* Trash */}
        <Route
          path="/trash"
          element={
            <ProtectedRoute>
              <TrashPage courses={courses} onRestoreCourse={handleRestoreCourse} />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
