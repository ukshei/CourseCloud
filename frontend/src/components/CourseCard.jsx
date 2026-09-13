import { useNavigate } from "react-router-dom";

function CourseCard({ id, name, code, onEdit, onDelete }) {
  const navigate = useNavigate();

  function handleEditClick(e) {
    e.stopPropagation();
    e.preventDefault();
    onEdit(id);
  }

  function handleDeleteClick(e) {
    e.stopPropagation();
    e.preventDefault();
    onDelete(id);
  }

  function handleCardClick() {
    navigate(`/courses/${id}`);
  }

  return (
    <div className="course-card" onClick={handleCardClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") handleCardClick(); }}>
      <div className="course-card-top">
        <div className="course-card-meta">
          {code ? (
            <span className="course-card-code">{code}</span>
          ) : (
            <span className="course-card-code-placeholder">Course</span>
          )}
        </div>

        <div className="course-card-actions">
          <button
            type="button"
            className="course-card-edit-button"
            onClick={handleEditClick}
            title="Edit course"
            aria-label={`Edit ${name}`}
          >
            ✎ Edit
          </button>
          <button
            type="button"
            className="course-card-delete-button"
            onClick={handleDeleteClick}
            title="Delete course"
            aria-label={`Delete ${name}`}
          >
            🗑 Delete
          </button>
        </div>
      </div>

      <div className="course-card-body">
        <h3 className="course-card-title" title={name}>{name}</h3>
      </div>

      <div className="course-card-footer">
        <button
          type="button"
          className="course-card-open-button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/courses/${id}`);
          }}
          title={`Open ${name}`}
        >
          <span>Open Course</span>
          <span className="course-card-arrow">→</span>
        </button>
      </div>
    </div>
  );
}

export default CourseCard;
