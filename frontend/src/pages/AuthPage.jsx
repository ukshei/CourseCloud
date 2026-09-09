import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function AuthPage() {
  const navigate = useNavigate();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleAuthenticate(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);

    if (isSignUp) {
      // Sign Up
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (signUpError) {
        setError(`Sign up failed: ${signUpError.message}`);
        setLoading(false);
        return;
      }

      // Check if email confirmation is required
      if (data?.user && !data.session) {
        // Email confirmation required
        setSuccess(
          "Sign up successful! Please check your email to confirm your account.",
        );
        setEmail("");
        setPassword("");
        setLoading(false);
        return;
      }

      // No confirmation required, user is logged in
      if (data?.session) {
        navigate("/");
        return;
      }
    } else {
      // Log In
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (signInError) {
        setError(`Login failed: ${signInError.message}`);
        setLoading(false);
        return;
      }

      if (data?.session) {
        navigate("/");
        return;
      }
    }

    setLoading(false);
  }

  function toggleMode() {
    setIsSignUp(!isSignUp);
    setError("");
    setSuccess("");
    setEmail("");
    setPassword("");
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="logo-box">CC</div>
          </div>

          <h1>CourseCloud</h1>
          <p className="auth-subtitle">
            {isSignUp ? "Create your account" : "Welcome back"}
          </p>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <form onSubmit={handleAuthenticate}>
            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="your@email.com"
                disabled={loading}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth-submit-button"
            >
              {loading
                ? isSignUp
                  ? "Creating account..."
                  : "Logging in..."
                : isSignUp
                  ? "Sign Up"
                  : "Log In"}
            </button>
          </form>

          <div className="auth-toggle">
            <p>
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
            </p>
            <button
              type="button"
              onClick={toggleMode}
              disabled={loading}
              className="auth-toggle-button"
            >
              {isSignUp ? "Log In" : "Sign Up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
