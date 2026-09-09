import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";

function CoursePage({ courses, loading, error }) {
  const { courseId } = useParams();

  const course = courses.find((item) => String(item.id) === courseId);

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
      .eq("course_id", Number(courseId));

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
      .eq("course_id", Number(courseId))
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

    const filePath = `${courseId}/${Date.now()}-${selectedFile.name}`;

    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(filePath, selectedFile);

    if (uploadError) {
      setFilesError(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { error: databaseError } = await supabase.from("files").insert({
      course_id: Number(courseId),
      file_name: selectedFile.name,
      file_path: filePath,
    });

    if (databaseError) {
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
      const { error: insertError } = await supabase.from("notes").insert({
        course_id: Number(courseId),
        title: noteTitle.trim(),
        content: noteContent,
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
            <h1>{course.name}</h1>
            <p>{course.code}</p>

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
    </div>
  );
}

export default CoursePage;
