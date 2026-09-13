import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";
import { restoreFile, deleteFilePermanently } from "../lib/fileApi";

function TrashPage({ courses = [], onRestoreCourse }) {
  const navigate = useNavigate();

  const [trashedCourses, setTrashedCourses] = useState([]);
  const [trashedFiles, setTrashedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const [activeTab, setActiveTab] = useState("all"); // "all" | "courses" | "files"

  // Modals
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    item: null,
    action: "", // "deletePermanent" | "emptyTrash"
  });
  const [processing, setProcessing] = useState(false);

  // -------------------------
  // FETCH TRASH DATA
  // -------------------------
  async function fetchTrash() {
    setLoading(true);
    setFetchError("");

    try {
      // 1. Fetch trashed courses
      const { data: coursesData, error: coursesError } = await supabase
        .from("courses")
        .select("id, name, code, created_at, deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      // 2. Fetch trashed files
      const { data: filesData, error: filesError } = await supabase
        .from("files")
        .select("id, course_id, file_name, file_path, created_at, deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (coursesError && !coursesError.message?.includes("deleted_at")) {
        setFetchError(coursesError.message);
      } else {
        setTrashedCourses(coursesData ?? []);
      }

      if (filesError && !filesError.message?.includes("deleted_at")) {
        setFetchError((prev) => (prev ? `${prev}; ${filesError.message}` : filesError.message));
      } else {
        setTrashedFiles(filesData ?? []);
      }
    } catch (err) {
      setFetchError(err.message || "Failed to load trash items.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTrash();
  }, []);

  // -------------------------
  // TIME & RETENTION HELPERS
  // -------------------------
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  function getTimeRemaining(deletedAtIso) {
    if (!deletedAtIso) return { text: "Unknown", expired: false };
    const deletedTime = new Date(deletedAtIso).getTime();
    const expiresAt = deletedTime + TWENTY_FOUR_HOURS_MS;
    const diff = expiresAt - Date.now();

    if (diff <= 0) {
      return { text: "Expired (ready for deletion)", expired: true };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return { text: `${hours}h ${minutes}m left`, expired: false };
    }
    return { text: `${minutes}m left`, expired: false };
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function getCourseInfo(courseId) {
    const course = courses.find((c) => c.id === courseId || c.id === Number(courseId));
    if (course) return course;
    // Check if the course itself is in trashedCourses
    return trashedCourses.find((c) => c.id === courseId || c.id === Number(courseId));
  }

  // -------------------------
  // RESTORE ACTIONS
  // -------------------------
  async function handleRestoreCourse(course) {
    setActionError("");
    setActionSuccess("");

    const { error } = await supabase
      .from("courses")
      .update({ deleted_at: null })
      .eq("id", course.id);

    if (error) {
      setActionError(`Failed to restore course: ${error.message}`);
      return;
    }

    // Remove from trash state
    setTrashedCourses((prev) => prev.filter((c) => c.id !== course.id));
    // Notify shared state in App.jsx
    if (onRestoreCourse) {
      onRestoreCourse({ ...course, deleted_at: null });
    }
    setActionSuccess(`Course "${course.name}" restored successfully.`);
    setTimeout(() => setActionSuccess(""), 3000);
  }

  async function handleRestoreFile(file) {
    setActionError("");
    setActionSuccess("");

    try {
      await restoreFile(file.id);
      setTrashedFiles((prev) => prev.filter((f) => f.id !== file.id));
      setActionSuccess(`File "${file.file_name}" restored successfully.`);
      setTimeout(() => setActionSuccess(""), 3000);
    } catch (err) {
      setActionError(`Failed to restore file: ${err.message}`);
    }
  }

  // -------------------------
  // PERMANENT DELETE ACTIONS
  // -------------------------
  function openPermanentDeleteModal(item, type) {
    setActionError("");
    setConfirmModal({
      show: true,
      item: { ...item, itemType: type },
      action: "deletePermanent",
    });
  }

  function openEmptyTrashModal() {
    setActionError("");
    setConfirmModal({
      show: true,
      item: null,
      action: "emptyTrash",
    });
  }

  function closeConfirmModal() {
    setConfirmModal({ show: false, item: null, action: "" });
  }

  async function handleConfirmModalAction() {
    setProcessing(true);
    setActionError("");

    try {
      if (confirmModal.action === "deletePermanent") {
        const { item } = confirmModal;

        if (item.itemType === "course") {
          // 1. Find and delete associated Storage files to avoid orphaned objects
          const { data: courseFiles } = await supabase
            .from("files")
            .select("file_path")
            .eq("course_id", item.id);

          if (courseFiles && courseFiles.length > 0) {
            const paths = courseFiles.map((f) => f.file_path).filter(Boolean);
            if (paths.length > 0) {
              await supabase.storage.from("course-files").remove(paths);
            }
          }

          // 2. Delete database course record (cascades to DB child rows)
          const { error: dbError } = await supabase
            .from("courses")
            .delete()
            .eq("id", item.id);

          if (dbError) throw dbError;

          setTrashedCourses((prev) => prev.filter((c) => c.id !== item.id));
          // Also remove any trashed files belonging to this course
          setTrashedFiles((prev) => prev.filter((f) => f.course_id !== item.id));
          setActionSuccess(`Course "${item.name}" permanently deleted.`);
        } else if (item.itemType === "file") {
          await deleteFilePermanently(item.id);
          setTrashedFiles((prev) => prev.filter((f) => f.id !== item.id));
          setActionSuccess(`File "${item.file_name}" permanently deleted.`);
        }
      } else if (confirmModal.action === "emptyTrash") {
        // 1. Remove all trashed file objects from Storage
        const filePaths = trashedFiles.map((f) => f.file_path).filter(Boolean);
        if (filePaths.length > 0) {
          await supabase.storage.from("course-files").remove(filePaths);
        }

        // Also check if any trashed courses have files in storage
        for (const c of trashedCourses) {
          const { data: cFiles } = await supabase
            .from("files")
            .select("file_path")
            .eq("course_id", c.id);
          if (cFiles && cFiles.length > 0) {
            const paths = cFiles.map((f) => f.file_path).filter(Boolean);
            if (paths.length > 0) {
              await supabase.storage.from("course-files").remove(paths);
            }
          }
        }

        // 2. Delete rows
        if (trashedFiles.length > 0) {
          await supabase
            .from("files")
            .delete()
            .in("id", trashedFiles.map((f) => f.id));
        }

        if (trashedCourses.length > 0) {
          await supabase
            .from("courses")
            .delete()
            .in("id", trashedCourses.map((c) => c.id));
        }

        setTrashedCourses([]);
        setTrashedFiles([]);
        setActionSuccess("Trash has been emptied.");
      }

      closeConfirmModal();
      setTimeout(() => setActionSuccess(""), 3000);
    } catch (err) {
      setActionError(`Permanent deletion failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }

  // -------------------------
  // COMBINED LIST & FILTERING
  // -------------------------
  const allTrashedItems = [
    ...trashedCourses.map((c) => ({ ...c, itemType: "course" })),
    ...trashedFiles.map((f) => ({ ...f, itemType: "file" })),
  ].sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));

  const filteredItems = allTrashedItems.filter((item) => {
    if (activeTab === "courses") return item.itemType === "course";
    if (activeTab === "files") return item.itemType === "file";
    return true;
  });

  const totalItemsCount = allTrashedItems.length;

  return (
    <div className="app">
      <Header />

      <main className="contents">
        {/* HEADER */}
        <div className="dashboard-header">
          <div>
            <h1>Trash</h1>
            <p>Deleted courses and files are kept here for 24 hours before permanent removal</p>
          </div>
          {totalItemsCount > 0 && (
            <button
              type="button"
              onClick={openEmptyTrashModal}
              className="trash-empty-all-button"
              title="Permanently remove all items in Trash"
            >
              Empty Trash
            </button>
          )}
        </div>

        {/* NOTIFICATIONS / FEEDBACK */}
        {actionSuccess && (
          <div className="settings-success-message" style={{ maxWidth: "1300px" }}>
            {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="files-error-message" style={{ maxWidth: "1300px" }}>
            {actionError}
          </div>
        )}
        {fetchError && (
          <div className="files-error-message" style={{ maxWidth: "1300px" }}>
            Unable to load trash: {fetchError}
          </div>
        )}

        {/* LOADING */}
        {loading && <p>Loading trash items...</p>}

        {/* EMPTY STATE */}
        {!loading && totalItemsCount === 0 && (
          <div className="dashboard-empty-state">
            <div className="dashboard-empty-icon" aria-hidden="true">🗑</div>
            <h2 className="dashboard-empty-title">Trash is empty</h2>
            <p className="dashboard-empty-message">
              Items you delete from your courses or files will appear here for 24 hours before being permanently deleted.
            </p>
            <button
              className="dashboard-get-started-button"
              onClick={() => navigate("/courses")}
            >
              Back to Courses
            </button>
          </div>
        )}

        {/* TRASH ITEMS LIST */}
        {!loading && totalItemsCount > 0 && (
          <div className="trash-page-content">
            {/* TABS */}
            <div className="trash-tabs">
              <button
                type="button"
                className={`trash-tab ${activeTab === "all" ? "active" : ""}`}
                onClick={() => setActiveTab("all")}
              >
                All Items ({totalItemsCount})
              </button>
              <button
                type="button"
                className={`trash-tab ${activeTab === "courses" ? "active" : ""}`}
                onClick={() => setActiveTab("courses")}
              >
                Courses ({trashedCourses.length})
              </button>
              <button
                type="button"
                className={`trash-tab ${activeTab === "files" ? "active" : ""}`}
                onClick={() => setActiveTab("files")}
              >
                Files ({trashedFiles.length})
              </button>
            </div>

            {/* LIST */}
            <div className="trash-list">
              {filteredItems.map((item) => {
                const isCourse = item.itemType === "course";
                const courseInfo = isCourse ? null : getCourseInfo(item.course_id);
                const retention = getTimeRemaining(item.deleted_at);

                return (
                  <div key={`${item.itemType}-${item.id}`} className="trash-row">
                    <div className="trash-icon-column">
                      <span className="trash-icon">{isCourse ? "📚" : "📄"}</span>
                    </div>

                    <div className="trash-info-column">
                      <div className="trash-title-row">
                        <span className="trash-item-name">
                          {isCourse ? item.name : item.file_name}
                        </span>
                        <span className={`trash-type-badge ${item.itemType}`}>
                          {isCourse ? "Course" : "File"}
                        </span>
                        {isCourse && item.code && (
                          <span className="course-card-code">{item.code}</span>
                        )}
                        <span
                          className={`trash-countdown-badge ${
                            retention.expired ? "expired" : ""
                          }`}
                          title="Retention period before permanent automatic purge"
                        >
                          ⏱ {retention.text}
                        </span>
                      </div>

                      <div className="trash-meta-row">
                        {!isCourse && (
                          <span className="trash-location">
                            Original course:{" "}
                            <strong>{courseInfo?.name || "Unknown Course"}</strong>
                            {courseInfo?.code ? ` (${courseInfo.code})` : ""}
                          </span>
                        )}
                        <span className="file-meta">
                          Deleted on {formatDateTime(item.deleted_at)}
                        </span>
                      </div>
                    </div>

                    <div className="trash-actions-column">
                      <button
                        type="button"
                        onClick={() =>
                          isCourse ? handleRestoreCourse(item) : handleRestoreFile(item)
                        }
                        className="file-action-button trash-restore-button"
                        title="Restore item to its original location"
                      >
                        ↺ Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => openPermanentDeleteModal(item, item.itemType)}
                        className="file-action-button trash-delete-button"
                        title="Permanently delete from database and storage"
                      >
                        Delete Permanently
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* -------------------------
          CONFIRMATION MODAL
          ------------------------- */}
      {confirmModal.show && (
        <div className="modal-overlay" onClick={closeConfirmModal}>
          <div
            className="modal-content trash-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>
              {confirmModal.action === "emptyTrash"
                ? "Empty Trash?"
                : "Delete Permanently?"}
            </h2>

            <p className="modal-warning">
              {confirmModal.action === "emptyTrash"
                ? `Are you sure you want to permanently delete all ${totalItemsCount} items? All database records and associated storage files will be removed. This cannot be undone.`
                : `Are you sure you want to permanently delete "${
                    confirmModal.item?.itemType === "course"
                      ? confirmModal.item?.name
                      : confirmModal.item?.file_name
                  }"? All associated files and data will be permanently removed. This action cannot be undone.`}
            </p>

            <div className="modal-actions">
              <button
                type="button"
                onClick={closeConfirmModal}
                disabled={processing}
                className="modal-cancel-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmModalAction}
                disabled={processing}
                className="modal-delete-button"
              >
                {processing ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrashPage;
