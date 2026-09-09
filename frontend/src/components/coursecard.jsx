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

  return (
    <div className="course-card">
      <h2>{name}</h2>
      <p>{code}</p>

      <div className="course-card-actions">
        <button
          className="course-card-edit-button"
          onClick={handleEditClick}
          title="Edit course"
        >
          ✎ Edit
        </button>
        <button
          className="course-card-delete-button"
          onClick={handleDeleteClick}
          title="Delete course"
        >
          🗑 Delete
        </button>
      </div>

      <button
        className="course-button"
        onClick={() => navigate(`/courses/${id}`)}
      >
        <div className="text">
          <span>Open</span>
          <span>Course</span>
        </div>

        <div className="clone">
          <span>Open</span>
          <span>Course</span>
        </div>

        <svg
          strokeWidth="2"
          stroke="currentColor"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
        >
          <path
            d="M14 5l7 7m0 0l-7 7m7-7H3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export default CourseCard;
