const jwt = require("jsonwebtoken");
const { redis } = require("./redis");

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "7d";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Warn on startup if secrets are missing (server still starts so healthcheck passes)
if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  console.error("❌ WARNING: ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be set in environment variables");
}

/**
 * Generates a signed JWT access token with 15-minute expiry.
 * @param {{ id: string, email: string, name: string }} user
 * @returns {string}
 */
function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name, type: "access" },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generates a signed JWT refresh token with 7-day expiry.
 * @param {{ id: string, email: string, name: string }} user
 * @returns {string}
 */
function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name, type: "refresh" },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

/**
 * Verifies an access token. Returns decoded payload or null if invalid/expired.
 * @param {string} token
 * @returns {object|null}
 */
function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
    if (payload.type !== "access") return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Verifies a refresh token. Returns decoded payload or null if invalid/expired.
 * @param {string} token
 * @returns {object|null}
 */
function verifyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, REFRESH_TOKEN_SECRET);
    if (payload.type !== "refresh") return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Stores a refresh token in Redis with a 7-day TTL.
 * Key pattern: refresh_token:{userId}
 * @param {string} userId
 * @param {string} token
 * @returns {Promise<void>}
 */
async function storeRefreshToken(userId, token) {
  try {
    await redis.set(`refresh_token:${userId}`, token, "EX", REFRESH_TOKEN_TTL_SECONDS);
  } catch (err) {
    console.error("❌ Redis storeRefreshToken failed:", err.message);
  }
}

/**
 * Validates the provided refresh token against the value stored in Redis.
 * @param {string} userId
 * @param {string} token
 * @returns {Promise<boolean>}
 */
async function validateRefreshToken(userId, token) {
  try {
    const stored = await redis.get(`refresh_token:${userId}`);
    return stored === token;
  } catch (err) {
    console.error("❌ Redis validateRefreshToken failed:", err.message);
    // Cannot validate — treat as invalid for security
    return false;
  }
}

/**
 * Deletes the refresh token from Redis, invalidating the user's session.
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function revokeRefreshToken(userId) {
  try {
    await redis.del(`refresh_token:${userId}`);
  } catch (err) {
    console.error("❌ Redis revokeRefreshToken failed:", err.message);
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  storeRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
};
