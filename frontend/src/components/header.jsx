import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation, NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    // Get initial session
    async function getSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    }

    getSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target)
      ) {
        setShowProfileMenu(false);
      }
    }

    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showProfileMenu]);

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout error:", error.message);
      return;
    }

    setUser(null);
    setShowProfileMenu(false);
    navigate("/auth");
  }

  function closeMenu() {
    setShowProfileMenu(false);
  }

  return (
    <header className="header">
      <div className="header-brand">
        <div className="logo">CC</div>
        <h2>CourseCloud</h2>
      </div>

      <nav className="header-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/courses"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          Courses
        </NavLink>
        <NavLink
          to="/notes"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          Notes
        </NavLink>
        <NavLink
          to="/files"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          Files
        </NavLink>
      </nav>

      <div className="header-profile" ref={profileMenuRef}>
        <button
          className="profile-icon-button"
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          title="Profile menu"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </button>

        {showProfileMenu && !loading && user && (
          <div className="profile-menu">
            <div className="profile-menu-email">{user.email}</div>
            <div className="profile-menu-divider"></div>
            <button className="profile-menu-item disabled">Settings</button>
            <button className="profile-menu-item logout" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
