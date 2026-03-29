const { verifyAccessToken, revokeRefreshToken } = require("../lib/tokens");
const userRepository = require("../repositories/userRepository");

/**
 * Express middleware that requires a valid Bearer access token.
 * Reads "Authorization: Bearer <token>", verifies it,
 * checks the user still exists in the database (handles deleted accounts),
 * and attaches the decoded user to req.user before calling next().
 * Returns 401 if the token is missing, invalid, or the account was deleted.
 *
 * When a deleted account is detected, the Redis refresh token is also
 * revoked so subsequent /refresh calls fail immediately too.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access token required. Use Authorization: Bearer <token>",
    });
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyAccessToken(token);

  if (!payload) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }

  // Verify the account still exists in the database.
  // This catches deleted-user scenarios without waiting for token expiry.
  try {
    const user = await userRepository.findById(payload.userId);
    if (!user) {
      // Also revoke the Redis refresh token so /refresh fails too.
      // Fire-and-forget — don't await so we don't delay the 401 response.
      revokeRefreshToken(payload.userId).catch(() => {});

      return res.status(401).json({
        success: false,
        message: "Account not found. Please sign in again.",
        code: "ACCOUNT_DELETED",
      });
    }
  } catch {
    // If the DB check itself fails (e.g. DB down), fall through rather than
    // blocking all requests — the JWT is still valid in that case.
  }

  req.user = {
    id: payload.userId,
    email: payload.email,
    name: payload.name,
  };

  next();
}

module.exports = { requireAuth };
