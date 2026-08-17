function CourseCard({ name, code }) {
  return (
    <div className="course-card">
      <h2>{name}</h2>
      <p>{code}</p>
      <button>Open Course</button>
    </div>
  );
}

export default CourseCard;
