const bcrypt = require("bcryptjs");
const userRepository = require("../repositories/userRepository");
const {
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  verifyRefreshToken,
} = require("../lib/tokens");
const { sendMail } = require("../lib/mailer");

/**
 * Validates user credentials against MongoDB.
 * Generates and stores access + refresh tokens on success.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>}
 * @throws {Error} if credentials are invalid
 */
async function loginService(email, password) {
  const user = await userRepository.findByEmail(email);

  // Constant-time protection: always run bcrypt even for unknown emails
  const dummyHash = "$2a$12$invalidhashusedfortimingprotect0000000000000";
  const isPasswordValid = user
    ? await user.comparePassword(password)
    : await bcrypt.compare(password, dummyHash).then(() => false);

  if (!user) {
    const err = new Error("No account found with this email address");
    err.field = "email";
    throw err;
  }

  if (user.provider !== "credentials") {
    const err = new Error("This email is registered with Google. Use \"Continue with Google\".");
    err.field = "email";
    throw err;
  }

  if (!isPasswordValid) {
    const err = new Error("Incorrect password. Please try again.");
    err.field = "password";
    throw err;
  }

  const authUser = user.toAuthUser();
  const accessToken = generateAccessToken(authUser);
  const refreshToken = generateRefreshToken(authUser);

  await storeRefreshToken(authUser.id, refreshToken);

  // Non-blocking login alert — fire and forget
  const loginAt = new Date().toLocaleString("en-IN", {
    dateStyle: "full", timeStyle: "long", timeZone: "Asia/Kolkata",
  });
  setImmediate(() => {
    sendMail({
      subject: "New Login Alert",
      html: `<p>Someone just signed in.</p><ul><li><b>Email:</b> ${authUser.email}</li><li><b>Name:</b> ${authUser.name}</li><li><b>Time:</b> ${loginAt}</li></ul>`,
    });
  });

  return { user: authUser, accessToken, refreshToken };
}

/**
 * Finds or creates a user authenticated via Google OAuth.
 * Issues tokens and stores refresh token in Redis.
 * @param {{ email: string, name: string, googleId: string, avatar?: string }} data
 * @returns {Promise<{ user: object, accessToken: string }>}
 */
async function oauthService({ email, name, googleId, avatar }) {
  let user = await userRepository.findByEmailOrGoogleId(email, googleId);
  const existingUser = user; // null if brand-new, truthy if returning

  if (!user) {
    user = await userRepository.create({
      email,
      name,
      googleId,
      avatar: avatar ?? null,
      provider: "google",
      isVerified: true,
    });
  } else if (!user.googleId) {
    // Existing credentials user — link their Google account
    user.googleId = googleId;
    user.provider = "google";
    if (avatar) user.avatar = avatar;
    await user.save();
  }

  const authUser = user.toAuthUser();
  const accessToken = generateAccessToken(authUser);

  // Non-blocking Google login/register alert
  const isNewUser = !existingUser;
  const eventAt = new Date().toLocaleString("en-IN", {
    dateStyle: "full", timeStyle: "long", timeZone: "Asia/Kolkata",
  });
  setImmediate(() => {
    sendMail(
      isNewUser
        ? {
            subject: "New User Registered (Google)",
            html: `<p>A new account was created via Google.</p><ul><li><b>Name:</b> ${authUser.name}</li><li><b>Email:</b> ${authUser.email}</li><li><b>Time:</b> ${eventAt}</li></ul>`,
          }
        : {
            subject: "New Login Alert (Google)",
            html: `<p>Someone signed in via Google.</p><ul><li><b>Email:</b> ${authUser.email}</li><li><b>Name:</b> ${authUser.name}</li><li><b>Time:</b> ${eventAt}</li></ul>`,
          }
    );
  });

  return { user: authUser, accessToken };
}

/**
 * Revokes the user's refresh token from Redis.
 * @param {string} userId
 */
async function logoutService(userId) {
  await revokeRefreshToken(userId);
}

/**
 * Verifies refresh token, validates against Redis, rotates both tokens.
 * @param {string} token - Refresh token from HttpOnly cookie
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
async function refreshTokenService(token) {
  const payload = verifyRefreshToken(token);
  if (!payload) throw new Error('Invalid or expired refresh token');

  const isValid = await validateRefreshToken(payload.userId, token);
  if (!isValid) throw new Error('Refresh token has been revoked');

  const user = await userRepository.findById(payload.userId);
  if (!user) throw new Error('User not found');

  const authUser = user.toAuthUser();
  const accessToken = generateAccessToken(authUser);
  const refreshToken = generateRefreshToken(authUser);

  await storeRefreshToken(authUser.id, refreshToken);

  return { accessToken, refreshToken };
}

/**
 * Returns the public profile for a given user ID.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getMeService(userId) {
  const user = await userRepository.findById(userId);
  if (!user) return null;
  return user.toAuthUser();
}

/**
 * Creates a new user with email + password credentials.
 * @param {{ name: string, email: string, password: string }} data
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>}
 * @throws {Error} if email is already taken
 */
async function registerService({ name, email, password }) {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new Error("Email already registered");
  }

  const user = await userRepository.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    provider: "credentials",
    isVerified: false,
  });

  const authUser = user.toAuthUser();
  const accessToken = generateAccessToken(authUser);
  const refreshToken = generateRefreshToken(authUser);

  await storeRefreshToken(authUser.id, refreshToken);

  // Non-blocking new-user alert
  const registeredAt = new Date().toLocaleString("en-IN", {
    dateStyle: "full", timeStyle: "long", timeZone: "Asia/Kolkata",
  });
  setImmediate(() => {
    sendMail({
      subject: "New User Registered",
      html: `<p>A new account was created.</p><ul><li><b>Name:</b> ${authUser.name}</li><li><b>Email:</b> ${authUser.email}</li><li><b>Time:</b> ${registeredAt}</li></ul>`,
    });
  });

  return { user: authUser, accessToken, refreshToken };
}

/**
 * Saves (or updates) the Bolna Platform API token for a user.
 * Also caches the Bolna account info (name, email, wallet) alongside the token.
 * Returns hasToken status without echoing the token.
 * @param {string} userId
 * @param {string} token
 * @param {{ bolnaId: string, name: string, email: string, wallet: number } | null} bolnaUserInfo
 * @returns {Promise<{ hasToken: boolean }>}
 */
async function updateBolnaTokenService(userId, token, bolnaUserInfo) {
  const updateData = { bolnaToken: token.trim() };
  if (bolnaUserInfo) updateData.bolnaUserInfo = bolnaUserInfo;
  await userRepository.updateById(userId, updateData);
  return { hasToken: true };
}

/**
 * Returns the raw Bolna token for internal server-side proxy use only.
 * Must NEVER be returned to the frontend.
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function getBolnaToken(userId) {
  const user = await userRepository.findById(userId);
  return user?.bolnaToken ?? null;
}

module.exports = { loginService, oauthService, logoutService, refreshTokenService, getMeService, registerService, updateBolnaTokenService, getBolnaToken };

