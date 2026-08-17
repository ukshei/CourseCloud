import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import CourseCard from "./components/CourseCard";
import "./App.css";
function App() {
  return (
    <div className="left-page">
      <Sidebar />
      <div className="right-page">
        <Header />
        <main className="contents">
          <h1>Welcome Back,</h1>
          <p>Student workspace</p>
          <div className="coursegrid">
            <CourseCard name="Database Systems" code="BCSE2021" />
            <CourseCard name="Data Structures" code="BCSE2022" />
            <CourseCard name="Operating Systems" code="BCSE2023" />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
