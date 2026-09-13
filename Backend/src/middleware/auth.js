/**
 * middleware/auth.js
 *
 * Express middleware that authenticates every incoming request.
 *
 * Flow:
 *  1. Extract the Bearer token from the Authorization header.
 *  2. Call supabase.auth.getUser(token) — this validates the JWT against
 *     Supabase's auth server using the service-role key, returning the
 *     authenticated user's profile.
 *  3. Attach the user object to req.user so downstream route handlers
 *     can safely use req.user.id for ownership scoping.
 *  4. Wrap downstream middleware execution in runWithUserToken to propagate
 *     user auth context to Supabase PostgREST queries.
 *
 * All routes that touch user data must use this middleware.
 */

const supabase = require("../supabaseClient");

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided." });
  }

  // Validate the JWT using Supabase Auth. getUser() checks the token
  // signature and expiry without needing a round-trip to the database.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({
      error: "Unauthorized: Invalid or expired token.",
    });
  }

  req.user = user;
  supabase.runWithUserToken(token, () => next());
}

module.exports = { verifyToken };
