import { useEffect, useState, useRef } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function Header() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    async function getSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    }

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Close menu on outside click
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

  // Derive display name and avatar initials from the user object
  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    null;

  const avatarInitial = displayName
    ? displayName.charAt(0).toUpperCase()
    : user?.email
      ? user.email.charAt(0).toUpperCase()
      : "?";

  return (
    <header className="header">
      {/* ── Brand ── */}
      <NavLink to="/" className="header-brand" aria-label="CourseCloud Home">
        <img
          src="/coursecloud-logo.png"
          alt="CourseCloud"
          className="header-brand-logo"
        />
      </NavLink>

      {/* ── Navigation ── */}
      <nav className="header-nav" aria-label="Main navigation">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/courses"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          Courses
        </NavLink>
        <NavLink
          to="/notes"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          Notes
        </NavLink>
        <NavLink
          to="/files"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          Files
        </NavLink>
        <NavLink
          to="/trash"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          Trash
        </NavLink>
      </nav>

      {/* ── Profile ── */}
      <div className="header-profile" ref={profileMenuRef}>
        <button
          id="profile-menu-trigger"
          className="profile-icon-button"
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          aria-haspopup="true"
          aria-expanded={showProfileMenu}
          title={user?.email ?? "Profile"}
        >
          {!loading && user ? (
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1 }}>
              {avatarInitial}
            </span>
          ) : (
            /* Generic user icon when not logged in / loading */
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </button>

        {showProfileMenu && !loading && user && (
          <div
            className="profile-menu"
            role="menu"
            aria-labelledby="profile-menu-trigger"
          >
            {/* Email / name block */}
            <div className="profile-menu-email">
              {displayName && <strong>{displayName}</strong>}
              {user.email}
            </div>

            <div className="profile-menu-divider" />

            <button
              className="profile-menu-item"
              role="menuitem"
              onClick={() => {
                setShowProfileMenu(false);
                navigate("/settings");
              }}
            >
              {/* Settings icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>

            <div className="profile-menu-divider" />

            <button
              className="profile-menu-item logout"
              role="menuitem"
              onClick={handleLogout}
            >
              {/* Log-out icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
