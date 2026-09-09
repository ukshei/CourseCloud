import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";

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

    const { error: updateError } = await supabase
      .from("courses")
      .update({
        name: editName.trim(),
        code: editCode.trim(),
      })
      .eq("id", numericCourseId);

    if (updateError) {
      setEditError(`Failed to update course: ${updateError.message}`);
      setEditingCourse(false);
      return;
    }

    // Propagate the change to the shared App courses state immediately.
    onEditCourse(numericCourseId, { name: editName.trim(), code: editCode.trim() });
    setShowEditModal(false);
    setEditingCourse(false);
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

    const { error: deleteErr } = await supabase
      .from("courses")
      .delete()
      .eq("id", numericCourseId);

    if (deleteErr) {
      setDeleteError(`Failed to delete course: ${deleteErr.message}`);
      setDeletingCourse(false);
      return;
    }

    // Remove from shared state and navigate away.
    onDeleteCourse(numericCourseId);
    navigate("/courses");
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
    const { data, error: fetchError } = await supabase
      .from("files")
      .select("id, file_name, file_path, created_at")
      .eq("course_id", numericCourseId);

    if (fetchError) {
      setFilesError(fetchError.message);
    } else {
      setFiles(data ?? []);
    }

    setFilesLoading(false);
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

  async function fetchNotes() {
    const { data, error: fetchError } = await supabase
      .from("notes")
      .select("id, title, content, created_at")
      .eq("course_id", numericCourseId)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setNotesError(fetchError.message);
    } else {
      setNotes(data ?? []);
    }

    setNotesLoading(false);
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
  // Also updates shared App state so Dashboard ordering reflects the visit immediately.
  useEffect(() => {
    if (!numericCourseId || isNaN(numericCourseId)) return;

    const timestamp = new Date().toISOString();

    supabase
      .from("courses")
      .update({ last_accessed_at: timestamp })
      .eq("id", numericCourseId)
      .then(() => {
        // Notify App so the shared courses array reflects the updated timestamp.
        onAccessCourse(numericCourseId, timestamp);
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setFilesError("You must be signed in to upload files.");
      setUploading(false);
      return;
    }

    const filePath = `${numericCourseId}/${Date.now()}-${selectedFile.name}`;

    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(filePath, selectedFile);

    if (uploadError) {
      setFilesError(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { error: databaseError } = await supabase.from("files").insert({
      course_id: numericCourseId,
      file_name: selectedFile.name,
      file_path: filePath,
      user_id: user.id,
    });

    if (databaseError) {
      // Roll back the Storage upload so we don't leave an orphaned file.
      await supabase.storage.from("course-files").remove([filePath]);

      setFilesError(
        `File uploaded, but database record failed: ${databaseError.message}`,
      );
      setUploading(false);
      return;
    }

    setSelectedFile(null);
    setUploading(false);

    await fetchFiles();
  }

  async function handleOpenFile(filePath) {
    setFilesError("");

    const { data, error: urlError } = await supabase.storage
      .from("course-files")
      .createSignedUrl(filePath, 60);

    if (urlError) {
      setFilesError(`Unable to open file: ${urlError.message}`);
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  async function handleDeleteFile(file) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${file.file_name}"?`,
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setFilesError("");

    const { error: storageError } = await supabase.storage
      .from("course-files")
      .remove([file.file_path]);

    if (storageError) {
      setFilesError(`Unable to delete file: ${storageError.message}`);
      setDeleting(false);
      return;
    }

    const { error: databaseError } = await supabase
      .from("files")
      .delete()
      .eq("id", file.id);

    if (databaseError) {
      setFilesError(
        `File deleted from Storage, but database record could not be deleted: ${databaseError.message}`,
      );
      setDeleting(false);
      return;
    }

    setDeleting(false);

    await fetchFiles();
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

    if (editingNoteId) {
      const { error: updateError } = await supabase
        .from("notes")
        .update({
          title: noteTitle.trim(),
          content: noteContent,
        })
        .eq("id", editingNoteId);

      if (updateError) {
        setNotesError(`Unable to update note: ${updateError.message}`);
        setSavingNote(false);
        return;
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setNotesError("You must be signed in to create notes.");
        setSavingNote(false);
        return;
      }

      const { error: insertError } = await supabase.from("notes").insert({
        course_id: numericCourseId,
        title: noteTitle.trim(),
        content: noteContent,
        user_id: user.id,
      });

      if (insertError) {
        setNotesError(`Unable to save note: ${insertError.message}`);
        setSavingNote(false);
        return;
      }
    }

    closeNoteEditor();
    setSavingNote(false);

    await fetchNotes();
  }

  async function handleDeleteNote(note) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${note.title}"?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingNote(true);
    setNotesError("");

    const { error: deleteError } = await supabase
      .from("notes")
      .delete()
      .eq("id", note.id);

    if (deleteError) {
      setNotesError(`Unable to delete note: ${deleteError.message}`);
      setDeletingNote(false);
      return;
    }

    setDeletingNote(false);

    await fetchNotes();
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
            <h1>{displayCourse.name}</h1>
            <p>{displayCourse.code}</p>

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
                🗑 Delete Course
              </button>
            </div>

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
                          onClick={() => handleOpenFile(file.file_path)}
                          className="file-action-button file-open-button"
                        >
                          Open
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
                          onClick={() => handleDeleteNote(note)}
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
                {deletingCourse ? "Deleting..." : "Delete Course"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CoursePage;
