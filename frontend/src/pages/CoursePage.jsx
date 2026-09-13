import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";
import { updateCourse, deleteCourse } from "../lib/courseApi";
import { getCourseNotes, createNote, updateNote, deleteNote } from "../lib/noteApi";
import { getCourseFiles, uploadCourseFile, getFileSignedUrl, deleteFile } from "../lib/fileApi";

function CoursePage({ courses, loading, error, onEditCourse, onDeleteCourse, onAccessCourse }) {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const course = courses.find((item) => String(item.id) === courseId);

  // Always use the numeric DB id for Storage paths and DB writes.
  // courseId from the URL is a string and may not match the numeric id
  // if the URL was constructed differently (e.g. using the course name).
  const numericCourseId = course ? Number(course.id) : Number(courseId);

  // course is always up-to-date from shared App state — no local override needed.
  const displayCourse = course;

  // -------------------------
  // EDIT COURSE
  // -------------------------

  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editingCourse, setEditingCourse] = useState(false);
  const [editError, setEditError] = useState("");

  function openEditModal() {
    if (!displayCourse) return;
    setEditName(displayCourse.name);
    setEditCode(displayCourse.code);
    setEditError("");
    setShowEditModal(true);
  }

  async function handleSaveCourseEdit(event) {
    event.preventDefault();
    setEditError("");

    if (!editName.trim() || !editCode.trim()) {
      setEditError("Please enter both course name and code.");
      return;
    }

    setEditingCourse(true);

    try {
      await updateCourse(numericCourseId, {
        name: editName.trim(),
        code: editCode.trim(),
      });

      // Propagate the change to the shared App courses state immediately.
      onEditCourse(numericCourseId, { name: editName.trim(), code: editCode.trim() });
      setShowEditModal(false);
    } catch (err) {
      setEditError(`Failed to update course: ${err.message}`);
    } finally {
      setEditingCourse(false);
    }
  }

  function cancelEditModal() {
    setEditName("");
    setEditCode("");
    setEditError("");
    setShowEditModal(false);
  }

  // -------------------------
  // DELETE COURSE
  // -------------------------

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleConfirmCourseDelete() {
    setDeleteError("");
    setDeletingCourse(true);

    try {
      await deleteCourse(numericCourseId);

      // Remove from shared state and navigate away.
      onDeleteCourse(numericCourseId);
      navigate("/courses");
    } catch (err) {
      setDeleteError(`Failed to move course to Trash: ${err.message}`);
    } finally {
      setDeletingCourse(false);
    }
  }

  function cancelDeleteModal() {
    setDeleteError("");
    setShowDeleteModal(false);
  }

  // -------------------------
  // FILES
  // -------------------------

  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function fetchFiles() {
    setFilesLoading(true);
    setFilesError("");

    try {
      const data = await getCourseFiles(numericCourseId);
      setFiles(data ?? []);
    } catch (err) {
      setFilesError(err.message);
    } finally {
      setFilesLoading(false);
    }
  }

  // -------------------------
  // NOTES
  // -------------------------

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");

  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  const [editingNoteId, setEditingNoteId] = useState(null);
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);

  const [showDeleteNoteModal, setShowDeleteNoteModal] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [deleteNoteError, setDeleteNoteError] = useState("");

  // Close modals on Escape key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (showDeleteNoteModal) {
          closeDeleteNoteModal();
        } else if (showEditModal) {
          cancelEditModal();
        } else if (showDeleteModal) {
          cancelDeleteModal();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDeleteNoteModal, showEditModal, showDeleteModal]);

  async function fetchNotes() {
    setNotesLoading(true);
    setNotesError("");

    try {
      const data = await getCourseNotes(numericCourseId);
      setNotes(data ?? []);
    } catch (err) {
      setNotesError(err.message);
    } finally {
      setNotesLoading(false);
    }
  }

  // -------------------------
  // LOAD DATA
  // -------------------------

  useEffect(() => {
    if (courseId) {
      fetchFiles();
      fetchNotes();
    }
  }, [courseId]);

  // Update last_accessed_at when this course page is opened.
  // Runs once per courseId. Errors are silently ignored so they
  // don't affect Files/Notes loading.
  // Update last_accessed_at via REST API when this course page is opened.
  // Runs once per courseId. Errors are silently ignored so they
  // don't affect Files/Notes loading.
  // Also updates shared App state so Dashboard ordering reflects the visit immediately.
  useEffect(() => {
    if (!numericCourseId || isNaN(numericCourseId)) return;

    const timestamp = new Date().toISOString();

    updateCourse(numericCourseId, { last_accessed_at: timestamp })
      .then(() => {
        // Notify App so the shared courses array reflects the updated timestamp.
        onAccessCourse(numericCourseId, timestamp);
      })
      .catch(() => {
        // Silently ignore to avoid disrupting Files/Notes
      });
  }, [numericCourseId]);

  // -------------------------
  // FILE FUNCTIONS
  // -------------------------

  function handleFileChange(event) {
    const file = event.target.files[0];

    setSelectedFile(file ?? null);
    setFilesError("");
  }

  async function handleUpload() {
    if (!selectedFile) {
      setFilesError("Please choose a file first.");
      return;
    }

    setUploading(true);
    setFilesError("");

    try {
      await uploadCourseFile(numericCourseId, selectedFile);
      setSelectedFile(null);
      await fetchFiles();
    } catch (err) {
      setFilesError(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleOpenFile(file) {
    setFilesError("");

    try {
      const fileId = typeof file === "object" ? file.id : file;
      const { signedUrl } = await getFileSignedUrl(fileId, { download: false });
      window.open(signedUrl, "_blank");
    } catch (err) {
      setFilesError(`Unable to open file: ${err.message}`);
    }
  }

  async function handleDownloadFile(file) {
    setFilesError("");

    try {
      const { signedUrl } = await getFileSignedUrl(file.id, { download: true });
      const anchor = document.createElement("a");
      anchor.href = signedUrl;
      anchor.download = file.file_name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err) {
      setFilesError(`Unable to download file: ${err.message}`);
    }
  }

  async function handleDeleteFile(file) {
    const confirmed = window.confirm(
      `Move "${file.file_name}" to Trash? It will be retained for 24 hours before permanent deletion.`,
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setFilesError("");

    try {
      await deleteFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err) {
      setFilesError(`Unable to move file to Trash: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  // -------------------------
  // NOTE FUNCTIONS
  // -------------------------

  function openNewNoteEditor() {
    setEditingNoteId(null);
    setNoteTitle("");
    setNoteContent("");
    setNotesError("");
    setShowNoteEditor(true);
  }

  function openEditNoteEditor(note) {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNotesError("");
    setShowNoteEditor(true);
  }

  function closeNoteEditor() {
    setShowNoteEditor(false);
    setEditingNoteId(null);
    setNoteTitle("");
    setNoteContent("");
    setNotesError("");
  }

  async function handleSaveNote() {
    if (!noteTitle.trim()) {
      setNotesError("Please enter a note title.");
      return;
    }

    setSavingNote(true);
    setNotesError("");

    try {
      if (editingNoteId) {
        await updateNote(editingNoteId, {
          title: noteTitle.trim(),
          content: noteContent,
        });
      } else {
        await createNote({
          course_id: numericCourseId,
          title: noteTitle.trim(),
          content: noteContent,
        });
      }

      closeNoteEditor();
      await fetchNotes();
    } catch (err) {
      setNotesError(`Unable to save note: ${err.message}`);
    } finally {
      setSavingNote(false);
    }
  }

  function openDeleteNoteModal(note) {
    setNoteToDelete(note);
    setDeleteNoteError("");
    setShowDeleteNoteModal(true);
  }

  function closeDeleteNoteModal() {
    setNoteToDelete(null);
    setDeleteNoteError("");
    setShowDeleteNoteModal(false);
  }

  async function handleConfirmDeleteNote() {
    if (!noteToDelete) return;

    setDeletingNote(true);
    setDeleteNoteError("");

    try {
      await deleteNote(noteToDelete.id);
      setShowDeleteNoteModal(false);
      setNoteToDelete(null);
      await fetchNotes();
    } catch (err) {
      setDeleteNoteError(`Unable to delete note: ${err.message}`);
    } finally {
      setDeletingNote(false);
    }
  }

  // -------------------------
  // PAGE
  // -------------------------

  return (
    <div className="app">
      <Header />

      <main className="contents">
        {loading ? (
          <p>Loading course...</p>
        ) : error ? (
          <p>Unable to load course: {error}</p>
        ) : course ? (
          <>
            <div className="dashboard-header">
              <div>
                <h1>{displayCourse.name}</h1>
                <p>{displayCourse.code || "Course Workspace"}</p>
              </div>

              <div className="course-page-actions">
                <button
                  type="button"
                  className="course-card-edit-button"
                  onClick={openEditModal}
                >
                  ✎ Edit Course
                </button>
                <button
                  type="button"
                  className="course-card-delete-button"
                  onClick={() => {
                    setDeleteError("");
                    setShowDeleteModal(true);
                  }}
                >
                  🗑 Move to Trash
                </button>
              </div>
            </div>

            <div className="course-page-content">
              {/* FILES */}

              <section className="files-section">
              <div className="files-header">
                <h2>Files</h2>

                <div className="files-upload-area">
                  <input
                    type="file"
                    id="file-input"
                    onChange={handleFileChange}
                    className="file-input-hidden"
                  />

                  <label htmlFor="file-input" className="file-choose-button">
                    Choose File
                  </label>

                  {selectedFile && (
                    <span className="selected-file-name">
                      {selectedFile.name}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="upload-button"
                  >
                    {uploading ? "Uploading..." : "Upload File"}
                  </button>
                </div>
              </div>

              {filesError && (
                <div className="files-error-message">{filesError}</div>
              )}

              {filesLoading && (
                <div className="files-empty-state">Loading files...</div>
              )}

              {!filesLoading && files.length === 0 && (
                <div className="files-empty-state">No files uploaded yet.</div>
              )}

              {!filesLoading && files.length > 0 && (
                <div className="files-list">
                  {files.map((file) => (
                    <div key={file.id} className="file-row">
                      <div className="file-icon-column">
                        <span className="file-icon">📄</span>
                      </div>

                      <div className="file-info-column">
                        <div className="file-name">{file.file_name}</div>

                        <div className="file-meta">
                          {new Date(file.created_at).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </div>
                      </div>

                      <div className="file-actions-column">
                        <button
                          type="button"
                          onClick={() => handleOpenFile(file)}
                          className="file-action-button file-open-button"
                        >
                          Open
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadFile(file)}
                          className="file-action-button file-download-button"
                          title={`Download ${file.file_name}`}
                        >
                          ↓ Download
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteFile(file)}
                          disabled={deleting}
                          className="file-action-button file-delete-button"
                        >
                          {deleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* NOTES */}

            <section className="notes-section">
              <div className="notes-header">
                <h2>Notes</h2>

                <button
                  type="button"
                  onClick={openNewNoteEditor}
                  className="new-note-button"
                >
                  + New Note
                </button>
              </div>

              {notesError && (
                <div className="notes-error-message">{notesError}</div>
              )}

              {showNoteEditor && (
                <div className="note-editor">
                  <h3>{editingNoteId ? "Edit Note" : "New Note"}</h3>

                  <div className="note-field">
                    <label htmlFor="note-title">Title</label>

                    <input
                      id="note-title"
                      type="text"
                      value={noteTitle}
                      onChange={(event) => setNoteTitle(event.target.value)}
                      placeholder="Note title"
                    />
                  </div>

                  <div className="note-field">
                    <label htmlFor="note-content">Content</label>

                    <textarea
                      id="note-content"
                      value={noteContent}
                      onChange={(event) => setNoteContent(event.target.value)}
                      placeholder="Write your notes here..."
                      rows="8"
                    />
                  </div>

                  <div className="note-editor-actions">
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={savingNote}
                      className="save-note-button"
                    >
                      {savingNote
                        ? "Saving..."
                        : editingNoteId
                          ? "Update Note"
                          : "Save Note"}
                    </button>

                    <button
                      type="button"
                      onClick={closeNoteEditor}
                      className="cancel-note-button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {notesLoading && (
                <div className="notes-empty-state">Loading notes...</div>
              )}

              {!notesLoading && notes.length === 0 && !showNoteEditor && (
                <div className="notes-empty-state">No notes yet.</div>
              )}

              {!notesLoading && notes.length > 0 && (
                <div className="notes-list">
                  {notes.map((note) => (
                    <div key={note.id} className="note-card">
                      <div className="note-card-content">
                        <h3>{note.title}</h3>

                        <p>{note.content}</p>

                        <div className="note-date">
                          {new Date(note.created_at).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </div>
                      </div>

                      <div className="note-card-actions">
                        <button
                          type="button"
                          onClick={() => openEditNoteEditor(note)}
                          className="edit-note-button"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => openDeleteNoteModal(note)}
                          disabled={deletingNote}
                          className="delete-note-button"
                        >
                          {deletingNote ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            </div>
          </>
        ) : (
          <h1>Course not found</h1>
        )}
      </main>

      {/* EDIT COURSE MODAL */}
      {showEditModal && (
        <div className="modal-overlay" onClick={cancelEditModal}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Edit Course</h2>

            {editError && <div className="modal-error">{editError}</div>}

            <form onSubmit={handleSaveCourseEdit}>
              <div className="modal-field">
                <label htmlFor="course-page-edit-name">Course Name</label>
                <input
                  id="course-page-edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g., Introduction to Computer Science"
                  disabled={editingCourse}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="course-page-edit-code">Course Code</label>
                <input
                  id="course-page-edit-code"
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
                  onClick={cancelEditModal}
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

      {/* DELETE COURSE MODAL */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={cancelDeleteModal}>
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
                onClick={cancelDeleteModal}
                disabled={deletingCourse}
                className="modal-cancel-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCourseDelete}
                disabled={deletingCourse}
                className="modal-delete-button"
              >
                {deletingCourse ? "Moving to Trash..." : "Move to Trash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE NOTE MODAL */}
      {showDeleteNoteModal && (
        <div className="modal-overlay" onClick={closeDeleteNoteModal}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-note-modal-title"
          >
            <h2 id="delete-note-modal-title">Delete note?</h2>

            <p className="modal-warning">
              Are you sure you want to delete{" "}
              <strong>&ldquo;{noteToDelete?.title}&rdquo;</strong>? This action cannot be undone.
            </p>

            {deleteNoteError && (
              <div className="modal-error">{deleteNoteError}</div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                onClick={closeDeleteNoteModal}
                disabled={deletingNote}
                className="modal-cancel-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteNote}
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

export default CoursePage;
