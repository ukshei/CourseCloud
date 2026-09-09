import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";

function FilesPage({ courses = [] }) {
  const navigate = useNavigate();

  // -------------------------
  // FILES STATE
  // -------------------------
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState("");
  const [actionError, setActionError] = useState("");

  // -------------------------
  // FILTER & SEARCH STATE
  // -------------------------
  const [courseFilter, setCourseFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // -------------------------
  // UPLOAD MODAL STATE
  // -------------------------
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCourseId, setUploadCourseId] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // -------------------------
  // DELETE MODAL STATE
  // -------------------------
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // -------------------------
  // FETCH FILES
  // -------------------------
  async function fetchFiles() {
    setFilesLoading(true);
    setFilesError("");

    const { data, error: fetchError } = await supabase
      .from("files")
      .select("id, course_id, file_name, file_path, created_at")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setFilesError(fetchError.message);
    } else {
      setFiles(data ?? []);
    }

    setFilesLoading(false);
  }

  useEffect(() => {
    fetchFiles();
  }, []);

  // -------------------------
  // HELPERS
  // -------------------------
  function getCourse(courseId) {
    return courses.find((c) => c.id === courseId || c.id === Number(courseId));
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getFileExtension(fileName) {
    if (!fileName || !fileName.includes(".")) return "";
    return fileName.split(".").pop().toUpperCase();
  }

  function getFileIcon(fileName) {
    const ext = getFileExtension(fileName).toLowerCase();
    if (["pdf"].includes(ext)) return "📕";
    if (["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "📝";
    if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
    if (["ppt", "pptx", "key"].includes(ext)) return "📽️";
    if (["zip", "rar", "tar", "gz", "7z"].includes(ext)) return "📦";
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "🖼️";
    if (["mp3", "wav", "m4a"].includes(ext)) return "🎵";
    if (["mp4", "mov", "avi", "mkv"].includes(ext)) return "🎬";
    if (["js", "jsx", "ts", "tsx", "py", "html", "css", "json"].includes(ext)) return "💻";
    return "📄";
  }

  // -------------------------
  // UPLOAD HANDLERS
  // -------------------------
  function openUploadModal() {
    setUploadError("");
    setSelectedFile(null);
    setUploadCourseId(courses.length > 0 ? String(courses[0].id) : "");
    setShowUploadModal(true);
  }

  function closeUploadModal() {
    setShowUploadModal(false);
    setSelectedFile(null);
    setUploadCourseId("");
    setUploadError("");
  }

  function handleFileSelection(event) {
    const file = event.target.files?.[0];
    setSelectedFile(file ?? null);
    setUploadError("");
  }

  async function handleUploadSubmit(event) {
    event.preventDefault();
    setUploadError("");

    if (!uploadCourseId) {
      setUploadError("Please select a course.");
      return;
    }

    if (!selectedFile) {
      setUploadError("Please choose a file to upload.");
      return;
    }

    setUploading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUploadError("You must be signed in to upload files.");
      setUploading(false);
      return;
    }

    const numericCourseId = Number(uploadCourseId);
    const filePath = `${numericCourseId}/${Date.now()}-${selectedFile.name}`;

    // 1. Upload to Supabase Storage
    const { error: storageError } = await supabase.storage
      .from("course-files")
      .upload(filePath, selectedFile);

    if (storageError) {
      setUploadError(`Upload failed: ${storageError.message}`);
      setUploading(false);
      return;
    }

    // 2. Insert record into files table
    const { data: newRows, error: dbError } = await supabase
      .from("files")
      .insert({
        course_id: numericCourseId,
        file_name: selectedFile.name,
        file_path: filePath,
        user_id: user.id,
      })
      .select("id, course_id, file_name, file_path, created_at");

    if (dbError) {
      // Rollback: remove the file from Storage so no orphaned file is left behind
      await supabase.storage.from("course-files").remove([filePath]);
      setUploadError(
        `File uploaded, but database record could not be saved: ${dbError.message}`
      );
      setUploading(false);
      return;
    }

    // 3. Immediately update UI state (newest first)
    if (newRows && newRows.length > 0) {
      setFiles((prev) => [newRows[0], ...prev]);
    } else {
      await fetchFiles();
    }

    setUploading(false);
    closeUploadModal();
  }

  // -------------------------
  // OPEN FILE HANDLER
  // -------------------------
  async function handleOpenFile(filePath) {
    setActionError("");

    const { data, error: urlError } = await supabase.storage
      .from("course-files")
      .createSignedUrl(filePath, 60);

    if (urlError) {
      setActionError(`Unable to open file: ${urlError.message}`);
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  // -------------------------
  // DELETE FILE HANDLERS
  // -------------------------
  function openDeleteModal(file) {
    setFileToDelete(file);
    setDeleteError("");
    setShowDeleteModal(true);
  }

  function closeDeleteModal() {
    setFileToDelete(null);
    setDeleteError("");
    setShowDeleteModal(false);
  }

  async function handleConfirmDelete() {
    if (!fileToDelete) return;

    setDeleting(true);
    setDeleteError("");

    // 1. Delete from Supabase Storage
    const { error: storageError } = await supabase.storage
      .from("course-files")
      .remove([fileToDelete.file_path]);

    if (storageError) {
      setDeleteError(`Unable to delete file from Storage: ${storageError.message}`);
      setDeleting(false);
      return;
    }

    // 2. Delete database record
    const { error: dbError } = await supabase
      .from("files")
      .delete()
      .eq("id", fileToDelete.id);

    if (dbError) {
      setDeleteError(
        `File deleted from Storage, but database record could not be deleted: ${dbError.message}`
      );
      setDeleting(false);
      return;
    }

    // 3. Immediately remove from local state
    setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
    setDeleting(false);
    closeDeleteModal();
  }

  // -------------------------
  // FILTER & SEARCH LOGIC
  // -------------------------
  const filteredFiles = files.filter((file) => {
    // 1. Course dropdown filter
    if (courseFilter !== "all" && String(file.course_id) !== String(courseFilter)) {
      return false;
    }

    // 2. Search query filter (file name, course name, course code)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const course = getCourse(file.course_id);
      const fileNameMatch = file.file_name?.toLowerCase().includes(q);
      const courseNameMatch = course?.name?.toLowerCase().includes(q);
      const courseCodeMatch = course?.code?.toLowerCase().includes(q);

      if (!fileNameMatch && !courseNameMatch && !courseCodeMatch) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="app">
      <Header />

      <main className="contents">
        {/* PAGE HEADER */}
        <div className="dashboard-header">
          <div>
            <h1>Files</h1>
            <p>All your uploaded documents and resources across every course</p>
          </div>
          <button
            className="add-course-button"
            onClick={openUploadModal}
            disabled={courses.length === 0}
            title={courses.length === 0 ? "Create a course first" : "Upload File"}
          >
            + Upload File
          </button>
        </div>

        {/* GENERAL ACTION ERROR */}
        {actionError && (
          <div className="files-error-message" style={{ width: "100%", maxWidth: "1300px" }}>
            {actionError}
          </div>
        )}

        {/* LOADING STATE */}
        {filesLoading && <p>Loading files...</p>}

        {/* FETCH ERROR */}
        {filesError && (
          <div className="files-error-message" style={{ width: "100%", maxWidth: "1300px" }}>
            Unable to load files: {filesError}
          </div>
        )}

        {/* EMPTY STATE — No files at all */}
        {!filesLoading && !filesError && files.length === 0 && (
          <div className="dashboard-empty-state">
            <h2 className="dashboard-empty-title">No files yet</h2>
            <p className="dashboard-empty-message">
              Upload assignments, lecture notes, or reference documents to keep your study materials organized.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                className="dashboard-get-started-button"
                onClick={openUploadModal}
                disabled={courses.length === 0}
              >
                Upload File
              </button>
              {courses.length === 0 && (
                <button
                  className="dashboard-get-started-button"
                  style={{ backgroundColor: "transparent", color: "#333", border: "1px solid #ddd" }}
                  onClick={() => navigate("/courses")}
                >
                  Create a Course First
                </button>
              )}
            </div>
          </div>
        )}

        {/* FILES CONTENT & FILTERS */}
        {!filesLoading && !filesError && files.length > 0 && (
          <>
            {/* FILTER & SEARCH BAR */}
            <div className="files-page-filter-bar">
              <div className="files-page-search-wrapper">
                <span className="files-page-search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by file name, course name, or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="files-page-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="files-page-search-clear"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="files-page-course-filter">
                <label htmlFor="course-filter-select" className="files-page-filter-label">
                  Filter by:
                </label>
                <select
                  id="course-filter-select"
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="files-page-select"
                >
                  <option value="all">All Courses ({files.length})</option>
                  {courses.map((course) => {
                    const count = files.filter(
                      (f) => String(f.course_id) === String(course.id)
                    ).length;
                    return (
                      <option key={course.id} value={String(course.id)}>
                        {course.name} {course.code ? `(${course.code})` : ""} [{count}]
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* NO SEARCH / FILTER RESULTS */}
            {filteredFiles.length === 0 && (
              <div className="files-empty-state" style={{ marginTop: "20px" }}>
                No files match your current search or course filter.
                <div style={{ marginTop: "12px" }}>
                  <button
                    type="button"
                    className="file-action-button"
                    onClick={() => {
                      setSearchQuery("");
                      setCourseFilter("all");
                    }}
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            )}

            {/* FILES LIST */}
            {filteredFiles.length > 0 && (
              <div className="files-list" style={{ marginTop: "20px" }}>
                {filteredFiles.map((file) => {
                  const course = getCourse(file.course_id);
                  const ext = getFileExtension(file.file_name);
                  const icon = getFileIcon(file.file_name);

                  return (
                    <div key={file.id} className="file-row files-page-row">
                      <div className="file-icon-column">
                        <span className="file-icon" title={ext ? `${ext} file` : "File"}>
                          {icon}
                        </span>
                      </div>

                      <div className="file-info-column">
                        <div className="files-page-title-row">
                          <span className="file-name">{file.file_name}</span>
                          {ext && <span className="files-page-ext-badge">{ext}</span>}
                        </div>

                        <div className="files-page-meta-row">
                          {/* Course badge */}
                          {course ? (
                            <span className="notes-page-course-badge">
                              <span className="notes-page-course-name">{course.name}</span>
                              {course.code && (
                                <span className="notes-page-course-code">{course.code}</span>
                              )}
                            </span>
                          ) : (
                            <span className="notes-page-course-badge">
                              <span className="notes-page-course-name notes-page-course-unknown">
                                Unknown Course
                              </span>
                            </span>
                          )}

                          <span className="file-meta">
                            Uploaded {formatDate(file.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="file-actions-column">
                        <button
                          type="button"
                          onClick={() => handleOpenFile(file.file_path)}
                          className="file-action-button file-open-button"
                          title="Open file in new tab"
                        >
                          Open
                        </button>

                        {course && (
                          <button
                            type="button"
                            onClick={() => navigate(`/courses/${course.id}`)}
                            className="file-action-button files-page-course-button"
                            title={`Go to ${course.name}`}
                          >
                            Open Course →
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openDeleteModal(file)}
                          className="file-action-button file-delete-button"
                          title="Delete file"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* -------------------------
          UPLOAD FILE MODAL
          ------------------------- */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={closeUploadModal}>
          <div
            className="modal-content files-page-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Upload File</h2>

            {uploadError && <div className="modal-error">{uploadError}</div>}

            <form onSubmit={handleUploadSubmit}>
              {/* COURSE SELECT */}
              <div className="modal-field">
                <label htmlFor="upload-course-select">Course</label>
                <select
                  id="upload-course-select"
                  value={uploadCourseId}
                  onChange={(e) => setUploadCourseId(e.target.value)}
                  disabled={uploading}
                  className="notes-page-select"
                >
                  <option value="">— Select a course —</option>
                  {courses.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name} {c.code ? `(${c.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* FILE PICKER */}
              <div className="modal-field">
                <label>Select File</label>
                <div className="files-page-file-picker">
                  <input
                    type="file"
                    id="standalone-file-input"
                    onChange={handleFileSelection}
                    className="file-input-hidden"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="standalone-file-input"
                    className="file-choose-button"
                    style={{ display: "inline-block", cursor: "pointer" }}
                  >
                    Choose File
                  </label>
                  {selectedFile ? (
                    <span className="selected-file-name" style={{ marginLeft: "12px" }}>
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  ) : (
                    <span style={{ marginLeft: "12px", color: "#888", fontSize: "14px" }}>
                      No file chosen
                    </span>
                  )}
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={closeUploadModal}
                  disabled={uploading}
                  className="modal-cancel-button"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile || !uploadCourseId}
                  className="modal-submit-button"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------
          DELETE CONFIRMATION MODAL
          ------------------------- */}
      {showDeleteModal && fileToDelete && (
        <div className="modal-overlay" onClick={closeDeleteModal}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Delete this file?</h2>

            <p className="modal-warning">
              Are you sure you want to delete <strong>"{fileToDelete.file_name}"</strong>? This will permanently delete the file from storage and database. This action cannot be undone.
            </p>

            {deleteError && <div className="modal-error">{deleteError}</div>}

            <div className="modal-actions">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleting}
                className="modal-cancel-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="modal-delete-button"
              >
                {deleting ? "Deleting..." : "Delete File"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FilesPage;
