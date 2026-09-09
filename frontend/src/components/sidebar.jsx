function Sidebar() {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <a href="#">Dashboard</a>
        <a href="#">Courses</a>
        <a href="#">Notes</a>
        <a href="#">Files</a>
      </nav>

      <div className="sidebar-settings">
        <button>⚙ Settings</button>
      </div>
    </aside>
  );
}

export default Sidebar;
