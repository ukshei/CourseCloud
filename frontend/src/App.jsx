import { useEffect, useState } from "react";
import Header from "./components/Header";
import CourseCard from "./components/CourseCard";
import CoursePage from "./pages/CoursePage";
import AuthPage from "./pages/AuthPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import "./App.css";

function Dashboard({ courses, loading, error, onAddCourse }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [addingCourse, setAddingCourse] = useState(false);
  const [addError, setAddError] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editingCourse, setEditingCourse] = useState(false);
  const [editError, setEditError] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingCourseId, setDeletingCourseId] = useState(null);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleAddCourse(event) {
    event.preventDefault();
    setAddError("");

    if (!courseName.trim() || !courseCode.trim()) {
      setAddError("Please enter both course name and code.");
      return;
    }

    setAddingCourse(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAddError("Unable to determine current user.");
      setAddingCourse(false);
      return;
    }

    const { error: insertError } = await supabase.from("courses").insert({
      name: courseName.trim(),
      code: courseCode.trim(),
      user_id: user.id,
    });

    if (insertError) {
      setAddError(`Failed to add course: ${insertError.message}`);
      setAddingCourse(false);
      return;
    }

    setCourseName("");
    setCourseCode("");
    setShowAddModal(false);
    setAddingCourse(false);

    await onAddCourse();
  }

  function handleCancel() {
    setCourseName("");
    setCourseCode("");
    setAddError("");
    setShowAddModal(false);
  }

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

    setEditName("");
    setEditCode("");
    setEditingCourseId(null);
    setShowEditModal(false);
    setEditingCourse(false);

    await onAddCourse();
  }

  function handleCancelEdit() {
    setEditName("");
    setEditCode("");
    setEditError("");
    setEditingCourseId(null);
    setShowEditModal(false);
  }

  function handleDeleteCourse(courseId) {
    setDeletingCourseId(courseId);
    setDeleteError("");
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    setDeleteError("");
    setDeletingCourse(true);

    const { error: deleteError } = await supabase
      .from("courses")
      .delete()
      .eq("id", deletingCourseId);

    if (deleteError) {
      setDeleteError(`Failed to delete course: ${deleteError.message}`);
      setDeletingCourse(false);
      return;
    }

    setDeletingCourseId(null);
    setShowDeleteModal(false);
    setDeletingCourse(false);

    await onAddCourse();
  }

  function handleCancelDelete() {
    setDeleteError("");
    setDeletingCourseId(null);
    setShowDeleteModal(false);
  }

  return (
    <div className="app">
      <Header />

      <main className="contents">
        <div className="dashboard-header">
          <div>
            <h1>Welcome Back,</h1>
            <p>Student workspace</p>
          </div>
          <button
            className="add-course-button"
            onClick={() => setShowAddModal(true)}
          >
            + Add Course
          </button>
        </div>

        {loading && <p>Loading courses...</p>}
        {error && <p>Unable to load courses: {error}</p>}
        {!loading && !error && (
          <div className="coursegrid">
            {courses.map((course) => (
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
        )}

        {showAddModal && (
          <div className="modal-overlay" onClick={handleCancel}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Add New Course</h2>

              {addError && <div className="modal-error">{addError}</div>}

              <form onSubmit={handleAddCourse}>
                <div className="modal-field">
                  <label htmlFor="course-name">Course Name</label>
                  <input
                    id="course-name"
                    type="text"
                    value={courseName}
                    onChange={(event) => setCourseName(event.target.value)}
                    placeholder="e.g., Introduction to Computer Science"
                    disabled={addingCourse}
                  />
                </div>

                <div className="modal-field">
                  <label htmlFor="course-code">Course Code</label>
                  <input
                    id="course-code"
                    type="text"
                    value={courseCode}
                    onChange={(event) => setCourseCode(event.target.value)}
                    placeholder="e.g., CS101"
                    disabled={addingCourse}
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={addingCourse}
                    className="modal-cancel-button"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingCourse}
                    className="modal-submit-button"
                  >
                    {addingCourse ? "Adding..." : "Add Course"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showEditModal && (
          <div className="modal-overlay" onClick={handleCancelEdit}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Edit Course</h2>

              {editError && <div className="modal-error">{editError}</div>}

              <form onSubmit={handleSaveChanges}>
                <div className="modal-field">
                  <label htmlFor="edit-course-name">Course Name</label>
                  <input
                    id="edit-course-name"
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    placeholder="e.g., Introduction to Computer Science"
                    disabled={editingCourse}
                  />
                </div>

                <div className="modal-field">
                  <label htmlFor="edit-course-code">Course Code</label>
                  <input
                    id="edit-course-code"
                    type="text"
                    value={editCode}
                    onChange={(event) => setEditCode(event.target.value)}
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

        {showDeleteModal && (
          <div className="modal-overlay" onClick={handleCancelDelete}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Delete this course?</h2>

              <p className="modal-warning">
                This will permanently delete the course and all of its
                associated files and notes.
              </p>

              {deleteError && <div className="modal-error">{deleteError}</div>}

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

function App() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchCourses() {
    const { data, error: fetchError } = await supabase
      .from("courses")
      .select("id, name, code");

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setCourses(data ?? []);
      setError("");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchCourses();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard
                courses={courses}
                loading={loading}
                error={error}
                onAddCourse={fetchCourses}
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/courses/:courseId"
          element={
            <ProtectedRoute>
              <CoursePage courses={courses} loading={loading} error={error} />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
