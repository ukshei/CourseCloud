import { useState } from "react";
import Header from "../components/Header";
import CourseCard from "../components/CourseCard";
import { createCourse, updateCourse, deleteCourse } from "../lib/courseApi";

function CoursesPage({ courses, loading, error, onAddCourse, onEditCourse, onDeleteCourse }) {
  // -------------------------
  // ADD COURSE
  // -------------------------

  const [showAddModal, setShowAddModal] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [addingCourse, setAddingCourse] = useState(false);
  const [addError, setAddError] = useState("");

  async function handleAddCourse(event) {
    event.preventDefault();
    setAddError("");

    if (!courseName.trim() || !courseCode.trim()) {
      setAddError("Please enter both course name and code.");
      return;
    }

    setAddingCourse(true);

    try {
      const newCourse = await createCourse({
        name: courseName.trim(),
        code: courseCode.trim(),
      });

      if (newCourse) {
        onAddCourse(newCourse);
      }

      setCourseName("");
      setCourseCode("");
      setShowAddModal(false);
    } catch (err) {
      setAddError(`Failed to add course: ${err.message}`);
    } finally {
      setAddingCourse(false);
    }
  }

  function handleCancelAdd() {
    setCourseName("");
    setCourseCode("");
    setAddError("");
    setShowAddModal(false);
  }

  // -------------------------
  // EDIT COURSE
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

      // Update shared state immediately.
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
  // DELETE COURSE
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

    try {
      await deleteCourse(deletingCourseId);

      // Remove from shared state immediately.
      onDeleteCourse(deletingCourseId);

      setDeletingCourseId(null);
      setShowDeleteModal(false);
    } catch (err) {
      setDeleteError(`Failed to move course to Trash: ${err.message}`);
    } finally {
      setDeletingCourse(false);
    }
  }

  function handleCancelDelete() {
    setDeleteError("");
    setDeletingCourseId(null);
    setShowDeleteModal(false);
  }

  // -------------------------
  // PAGE
  // -------------------------

  return (
    <div className="app">
      <Header />

      <main className="contents">
        <div className="dashboard-header">
          <div>
            <h1>Courses</h1>
            <p>Manage all your courses and academic subjects</p>
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
          <div className="courses-page-content">
            {courses.length === 0 ? (
              <div className="dashboard-empty-state">
                <div className="dashboard-empty-icon" aria-hidden="true">📚</div>
                <h2 className="dashboard-empty-title">No courses yet</h2>
                <p className="dashboard-empty-message">
                  Create your first course to begin organizing your lecture notes and files.
                </p>
                <button
                  className="dashboard-get-started-button"
                  onClick={() => setShowAddModal(true)}
                >
                  + Add Course
                </button>
              </div>
            ) : (
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
          </div>
        )}

        {/* ADD MODAL */}
        {showAddModal && (
          <div className="modal-overlay" onClick={handleCancelAdd}>
            <div
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <h2>Add New Course</h2>

              {addError && <div className="modal-error">{addError}</div>}

              <form onSubmit={handleAddCourse}>
                <div className="modal-field">
                  <label htmlFor="courses-page-name">Course Name</label>
                  <input
                    id="courses-page-name"
                    type="text"
                    value={courseName}
                    onChange={(event) => setCourseName(event.target.value)}
                    placeholder="e.g., Introduction to Computer Science"
                    disabled={addingCourse}
                  />
                </div>

                <div className="modal-field">
                  <label htmlFor="courses-page-code">Course Code</label>
                  <input
                    id="courses-page-code"
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
                    onClick={handleCancelAdd}
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
                  <label htmlFor="courses-page-edit-name">Course Name</label>
                  <input
                    id="courses-page-edit-name"
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    placeholder="e.g., Introduction to Computer Science"
                    disabled={editingCourse}
                  />
                </div>

                <div className="modal-field">
                  <label htmlFor="courses-page-edit-code">Course Code</label>
                  <input
                    id="courses-page-edit-code"
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

export default CoursesPage;
