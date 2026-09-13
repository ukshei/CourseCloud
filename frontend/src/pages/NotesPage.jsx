import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { getNotes, createNote, updateNote, deleteNote } from "../lib/noteApi";

function NotesPage({ courses }) {
  const navigate = useNavigate();

  // -------------------------
  // NOTES STATE
  // -------------------------

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");

  // -------------------------
  // FETCH NOTES
  // -------------------------

  async function fetchNotes() {
    setNotesLoading(true);
    setNotesError("");

    try {
      const data = await getNotes();
      setNotes(data ?? []);
    } catch (err) {
      setNotesError(err.message);
    } finally {
      setNotesLoading(false);
    }
  }

  useEffect(() => {
    fetchNotes();
  }, []);

  // -------------------------
  // EDITOR STATE (shared for create + edit)
  // -------------------------

  const [showEditor, setShowEditor] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null); // null = creating new
  const [editorCourseId, setEditorCourseId] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [editorError, setEditorError] = useState("");

  function openNewNoteEditor() {
    setEditingNoteId(null);
    setEditorCourseId(courses.length > 0 ? String(courses[0].id) : "");
    setEditorTitle("");
    setEditorContent("");
    setEditorError("");
    setShowEditor(true);
  }

  function openEditNoteEditor(note) {
    setEditingNoteId(note.id);
    setEditorCourseId(String(note.course_id));
    setEditorTitle(note.title);
    setEditorContent(note.content ?? "");
    setEditorError("");
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setEditingNoteId(null);
    setEditorCourseId("");
    setEditorTitle("");
    setEditorContent("");
    setEditorError("");
  }

  // -------------------------
  // SAVE NOTE (create or update)
  // -------------------------

  async function handleSaveNote(event) {
    event.preventDefault();
    setEditorError("");

    if (!editorCourseId) {
      setEditorError("Please select a course.");
      return;
    }

    if (!editorTitle.trim()) {
      setEditorError("Please enter a note title.");
      return;
    }

    setSavingNote(true);

    try {
      if (editingNoteId) {
        // UPDATE existing note via REST API (PATCH /api/notes/:id)
        const updated = await updateNote(editingNoteId, {
          course_id: Number(editorCourseId),
          title: editorTitle.trim(),
          content: editorContent,
        });

        // Update the note in local state immediately.
        setNotes((prev) =>
          prev.map((n) =>
            n.id === editingNoteId
              ? (updated || {
                  ...n,
                  course_id: Number(editorCourseId),
                  title: editorTitle.trim(),
                  content: editorContent,
                })
              : n
          )
        );
      } else {
        // CREATE new note via REST API (POST /api/notes)
        const newNote = await createNote({
          course_id: Number(editorCourseId),
          title: editorTitle.trim(),
          content: editorContent,
        });

        // Prepend new note so it appears first (newest first ordering).
        if (newNote) {
          setNotes((prev) => [newNote, ...prev]);
        }
      }

      closeEditor();
    } catch (err) {
      setEditorError(err.message);
    } finally {
      setSavingNote(false);
    }
  }

  // -------------------------
  // DELETE NOTE
  // -------------------------

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [deletingNote, setDeletingNote] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Close modals on Escape key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (showDeleteModal) {
          handleCancelDelete();
        } else if (showEditor) {
          closeEditor();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDeleteModal, showEditor]);

  function handleDeleteNote(note) {
    setNoteToDelete(note);
    setDeleteError("");
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    if (!noteToDelete) return;

    setDeleteError("");
    setDeletingNote(true);

    try {
      await deleteNote(noteToDelete.id);

      // Remove immediately from local state.
      setNotes((prev) => prev.filter((n) => n.id !== noteToDelete.id));
      setNoteToDelete(null);
      setShowDeleteModal(false);
    } catch (err) {
      setDeleteError(`Failed to delete note: ${err.message}`);
    } finally {
      setDeletingNote(false);
    }
  }

  function handleCancelDelete() {
    setDeleteError("");
    setNoteToDelete(null);
    setShowDeleteModal(false);
  }

  // -------------------------
  // HELPERS
  // -------------------------

  // Look up course name/code by course_id from the shared courses prop.
  function getCourse(courseId) {
    return courses.find((c) => c.id === courseId || c.id === Number(courseId));
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // Truncate preview to a max number of characters.
  function previewContent(text, max = 160) {
    if (!text) return "";
    return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
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
            <h1>Notes</h1>
            <p>All your notes across every course</p>
          </div>
          <button
            className="add-course-button"
            onClick={openNewNoteEditor}
            disabled={courses.length === 0}
            title={courses.length === 0 ? "Create a course first" : "New note"}
          >
            + New Note
          </button>
        </div>

        {/* LOADING */}
        {notesLoading && <p>Loading notes...</p>}

        {/* ERROR */}
        {notesError && (
          <div className="notes-error-message" style={{ width: "100%", maxWidth: "1300px" }}>
            Unable to load notes: {notesError}
          </div>
        )}

        {/* EMPTY STATE */}
        {!notesLoading && !notesError && notes.length === 0 && (
          <div className="dashboard-empty-state">
            <div className="dashboard-empty-icon" aria-hidden="true">📝</div>
            <h2 className="dashboard-empty-title">No notes yet</h2>
            <p className="dashboard-empty-message">
              Open a course and start writing, or create a note directly here.
            </p>
            <button
              className="dashboard-get-started-button"
              onClick={() => navigate("/courses")}
            >
              Go to Courses
            </button>
          </div>
        )}

        {/* NOTES GRID */}
        {!notesLoading && !notesError && notes.length > 0 && (
          <div className="notes-page-content">
            <div className="notes-page-grid">
              {notes.map((note) => {
                const course = getCourse(note.course_id);
                return (
                  <div key={note.id} className="notes-page-card">
                    <div className="notes-page-card-header">
                      <div className="notes-page-course-badge">
                        {course ? (
                          <>
                            <span className="notes-page-course-name">{course.name}</span>
                            {course.code && (
                              <span className="notes-page-course-code">{course.code}</span>
                            )}
                          </>
                        ) : (
                          <span className="notes-page-course-name unassigned">Unassigned</span>
                        )}
                      </div>
                      <span className="notes-page-date">{formatDate(note.created_at)}</span>
                    </div>

                    <h3 className="notes-page-card-title">{note.title}</h3>

                    <div className="notes-page-card-content">{previewContent(note.content)}</div>

                    <div className="notes-page-card-actions">
                      <button
                        type="button"
                        className="notes-page-action-button"
                        onClick={() => openEditNoteEditor(note)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="notes-page-action-button danger"
                        onClick={() => handleDeleteNote(note)}
                        disabled={deletingNote}
                      >
                        Delete
                      </button>
                      {course && (
                        <button
                          type="button"
                          className="notes-page-action-button notes-page-open-button"
                          onClick={() => navigate(`/courses/${course.id}`)}
                        >
                          Open Course →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* NO COURSES WARNING — shown above the editor if courses haven't loaded */}
        {!notesLoading && courses.length === 0 && (
          <p className="notes-page-no-courses">
            You need at least one course before creating a note.{" "}
            <button
              className="notes-page-inline-link"
              onClick={() => navigate("/courses")}
            >
              Create a course
            </button>
          </p>
        )}
      </main>

      {/* -------------------------
          NOTE EDITOR MODAL (create + edit)
          ------------------------- */}
      {showEditor && (
        <div className="modal-overlay" onClick={closeEditor}>
          <div
            className="modal-content notes-page-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editingNoteId ? "Edit Note" : "New Note"}</h2>

            {editorError && (
              <div className="modal-error">{editorError}</div>
            )}

            <form onSubmit={handleSaveNote}>
              {/* COURSE SELECT */}
              <div className="modal-field">
                <label htmlFor="notes-page-course-select">Course</label>
                <select
                  id="notes-page-course-select"
                  value={editorCourseId}
                  onChange={(e) => setEditorCourseId(e.target.value)}
                  disabled={savingNote}
                  className="notes-page-select"
                >
                  <option value="">— Select a course —</option>
                  {courses.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}{c.code ? ` (${c.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* TITLE */}
              <div className="modal-field">
                <label htmlFor="notes-page-title">Title</label>
                <input
                  id="notes-page-title"
                  type="text"
                  value={editorTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                  placeholder="Note title"
                  disabled={savingNote}
                />
              </div>

              {/* CONTENT */}
              <div className="modal-field">
                <label htmlFor="notes-page-content">Content</label>
                <textarea
                  id="notes-page-content"
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  placeholder="Write your notes here..."
                  rows="8"
                  disabled={savingNote}
                  className="notes-page-textarea"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={savingNote}
                  className="modal-cancel-button"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNote}
                  className="modal-submit-button"
                >
                  {savingNote
                    ? "Saving..."
                    : editingNoteId
                    ? "Save Changes"
                    : "Create Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------
          DELETE CONFIRMATION MODAL
          ------------------------- */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={handleCancelDelete}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-page-delete-title"
          >
            <h2 id="notes-page-delete-title">Delete note?</h2>

            <p className="modal-warning">
              Are you sure you want to delete{" "}
              <strong>&ldquo;{noteToDelete?.title}&rdquo;</strong>? This action
              cannot be undone.
            </p>

            {deleteError && (
              <div className="modal-error">{deleteError}</div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                onClick={handleCancelDelete}
                disabled={deletingNote}
                className="modal-cancel-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingNote}
                className="modal-delete-button"
              >
                {deletingNote ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotesPage;
