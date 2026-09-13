import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";

function SettingsPage() {
  const navigate = useNavigate();

  // -------------------------
  // USER & PROFILE STATE
  // -------------------------
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: "", text: "" });

  // -------------------------
  // APPEARANCE (THEME) STATE
  // -------------------------
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("coursecloud_theme") || "light";
  });

  // -------------------------
  // SECURITY STATE
  // -------------------------
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: "", text: "" });

  // -------------------------
  // ACCOUNT (SIGN OUT) STATE
  // -------------------------
  const [signingOut, setSigningOut] = useState(false);

  // -------------------------
  // LOAD USER
  // -------------------------
  useEffect(() => {
    async function fetchUserData() {
      setLoadingUser(true);
      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser();

      if (error || !currentUser) {
        navigate("/auth");
        return;
      }

      setUser(currentUser);
      const existingName =
        currentUser.user_metadata?.display_name ||
        currentUser.user_metadata?.full_name ||
        "";
      setDisplayName(existingName);
      setLoadingUser(false);
    }

    fetchUserData();
  }, [navigate]);

  // Apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("coursecloud_theme", theme);
  }, [theme]);

  // -------------------------
  // PROFILE HANDLER
  // -------------------------
  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileMessage({ type: "", text: "" });
    setSavingProfile(true);

    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName.trim() },
    });

    if (error) {
      setProfileMessage({
        type: "error",
        text: `Failed to update profile: ${error.message}`,
      });
    } else {
      setProfileMessage({
        type: "success",
        text: "Profile updated successfully.",
      });
    }

    setSavingProfile(false);
  }

  // -------------------------
  // APPEARANCE HANDLER
  // -------------------------
  function handleThemeChange(newTheme) {
    setTheme(newTheme);
  }

  // -------------------------
  // SECURITY HANDLER
  // -------------------------
  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordMessage({ type: "", text: "" });

    if (!newPassword) {
      setPasswordMessage({
        type: "error",
        text: "Please enter a new password.",
      });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage({
        type: "error",
        text: "Password must be at least 6 characters long.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({
        type: "error",
        text: "Passwords do not match.",
      });
      return;
    }

    setChangingPassword(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setPasswordMessage({
        type: "error",
        text: `Failed to change password: ${error.message}`,
      });
    } else {
      setPasswordMessage({
        type: "success",
        text: "Password changed successfully.",
      });
      setNewPassword("");
      setConfirmPassword("");
    }

    setChangingPassword(false);
  }

  // -------------------------
  // SIGN OUT HANDLER
  // -------------------------
  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate("/auth");
  }

  return (
    <div className="app">
      <Header />

      <main className="contents">
        <div className="dashboard-header">
          <div>
            <h1>Settings</h1>
            <p>Manage your account preferences, appearance, and security</p>
          </div>
        </div>

        {loadingUser ? (
          <p>Loading settings...</p>
        ) : (
          <div className="settings-container">
            {/* 1. PROFILE SECTION */}
            <section className="settings-card">
              <div className="settings-card-header">
                <h2>Profile</h2>
                <p>Personalize your account details</p>
              </div>

              {profileMessage.text && (
                <div
                  className={
                    profileMessage.type === "error"
                      ? "modal-error"
                      : "settings-success-message"
                  }
                >
                  {profileMessage.text}
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="settings-form">
                <div className="settings-field">
                  <label htmlFor="settings-email">Email Address</label>
                  <input
                    id="settings-email"
                    type="email"
                    value={user?.email || ""}
                    disabled
                    readOnly
                    className="settings-input-readonly"
                  />
                  <span className="settings-field-hint">
                    Your email address is managed via authentication and cannot be edited directly.
                  </span>
                </div>

                <div className="settings-field">
                  <label htmlFor="settings-display-name">Display Name</label>
                  <input
                    id="settings-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    disabled={savingProfile}
                  />
                </div>

                <div className="settings-actions">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="settings-button primary"
                  >
                    {savingProfile ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </form>
            </section>

            {/* 2. APPEARANCE SECTION */}
            <section className="settings-card">
              <div className="settings-card-header">
                <h2>Appearance</h2>
                <p>Choose your preferred interface theme</p>
              </div>

              <div className="settings-theme-selector">
                <button
                  type="button"
                  className={`settings-theme-option ${
                    theme === "light" ? "active" : ""
                  }`}
                  onClick={() => handleThemeChange("light")}
                >
                  <div className="settings-theme-preview light">
                    <div className="settings-preview-bar"></div>
                    <div className="settings-preview-card"></div>
                  </div>
                  <span className="settings-theme-label">☀️ Light Theme</span>
                </button>

                <button
                  type="button"
                  className={`settings-theme-option ${
                    theme === "dark" ? "active" : ""
                  }`}
                  onClick={() => handleThemeChange("dark")}
                >
                  <div className="settings-theme-preview dark">
                    <div className="settings-preview-bar"></div>
                    <div className="settings-preview-card"></div>
                  </div>
                  <span className="settings-theme-label">🌙 Dark Theme</span>
                </button>
              </div>
            </section>

            {/* 3. SECURITY SECTION */}
            <section className="settings-card">
              <div className="settings-card-header">
                <h2>Security</h2>
                <p>Manage your password and authentication</p>
              </div>

              {passwordMessage.text && (
                <div
                  className={
                    passwordMessage.type === "error"
                      ? "modal-error"
                      : "settings-success-message"
                  }
                >
                  {passwordMessage.text}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="settings-form">
                <div className="settings-field">
                  <label htmlFor="settings-new-password">New Password</label>
                  <input
                    id="settings-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter at least 6 characters"
                    disabled={changingPassword}
                  />
                </div>

                <div className="settings-field">
                  <label htmlFor="settings-confirm-password">
                    Confirm New Password
                  </label>
                  <input
                    id="settings-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    disabled={changingPassword}
                  />
                </div>

                <div className="settings-actions">
                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="settings-button primary"
                  >
                    {changingPassword ? "Updating..." : "Change Password"}
                  </button>
                </div>
              </form>
            </section>

            {/* 4. ACCOUNT SECTION */}
            <section className="settings-card">
              <div className="settings-card-header">
                <h2>Account</h2>
                <p>Session management and account actions</p>
              </div>

              <div className="settings-account-session">
                <div>
                  <span className="settings-toggle-title">Current Session</span>
                  <span className="settings-toggle-description">
                    Signed in as <strong>{user?.email}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="settings-button outline"
                >
                  {signingOut ? "Signing out..." : "Sign Out"}
                </button>
              </div>

              {/* DANGER ZONE */}
              <div className="settings-danger-zone">
                <div className="settings-danger-header">
                  <h3>Danger Zone</h3>
                  <p>Permanent actions regarding your account</p>
                </div>

                <div className="settings-danger-content">
                  <div>
                    <span className="settings-danger-title">Delete Account</span>
                    <span className="settings-danger-description">
                      Permanently remove your account, courses, notes, and uploaded files. Server-side verification flow is required.
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="settings-button danger disabled"
                    title="Account deletion requires server-side administrative verification (Coming Soon)"
                  >
                    Delete Account
                  </button>
                </div>
                <p className="settings-danger-notice">
                  * Client-side deletion is disabled for security. Server-side account purging will be available in an upcoming release.
                </p>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default SettingsPage;
