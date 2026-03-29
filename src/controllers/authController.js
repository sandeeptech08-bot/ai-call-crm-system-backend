const { loginSchema, registerSchema } = require("../validators/auth");
const {
  loginService,
  logoutService,
  refreshTokenService,
  getMeService,
  registerService,
  updateBolnaTokenService,
} = require("../services/authService");
const BOLNA_API_BASE = process.env.BOLNA_API_BASE || "https://api.bolna.ai";

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Returns cookie options for the HttpOnly refresh token cookie.
 */
function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

/**
 * POST /api/auth/login
 * Validates credentials, sets HttpOnly refresh token cookie, returns accessToken + user.
 */
async function login(req, res, next) {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.errors[0]?.message ?? "Validation failed",
      });
    }

    const { email, password } = result.data;
    const { user, accessToken, refreshToken } = await loginService(email, password);

    res.cookie("refreshToken", refreshToken, getRefreshCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user,
      accessToken,
    });
  } catch (error) {
    if (error.field) {
      return res.status(401).json({ success: false, message: error.message, field: error.field });
    }
    next(error);
  }
}

/**
 * POST /api/auth/logout  (protected)
 * Revokes the refresh token and clears the cookie.
 */
async function logout(req, res, next) {
  try {
    const userId = req.user.id;
    await logoutService(userId);
    res.clearCookie("refreshToken", { path: "/" });
    return res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/refresh
 * Rotates both tokens. Accepts refreshToken from:
 *   1. HttpOnly cookie (browser clients)
 *   2. Request body { refreshToken } (server-to-server proxy calls)
 * Always sets the new refreshToken as an HttpOnly cookie AND returns it in the body
 * so server-side callers can store it without relying on Set-Cookie forwarding.
 */
async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) {
      return res.status(401).json({ success: false, message: "No refresh token provided" });
    }

    const { accessToken, refreshToken } = await refreshTokenService(token);

    res.cookie("refreshToken", refreshToken, getRefreshCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      accessToken,
      refreshToken, // also in body for server-to-server callers
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(401).json({ success: false, message: error.message });
    }
    next(error);
  }
}

/**
 * GET /api/auth/me  (protected)
 * Returns the currently authenticated user's profile.
 */
async function me(req, res, next) {
  try {
    const userId = req.user.id;
    const user = await getMeService(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/register
 * Validates new user data, creates account, sets refresh cookie, returns tokens.
 */
async function register(req, res, next) {
  try {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.errors[0]?.message ?? "Validation failed",
      });
    }

    const { name, email, password } = result.data;
    const { user, accessToken, refreshToken } = await registerService({ name, email, password });

    res.cookie("refreshToken", refreshToken, getRefreshCookieOptions());

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user,
      accessToken,
    });
  } catch (error) {
    if (error.message === "Email already registered") {
      return res.status(409).json({ success: false, message: "An account with this email already exists" });
    }
    next(error);
  }
}

/**
 * PATCH /api/auth/bolna-token  (protected)
 * Stores the user's Bolna Platform API token. Never echoes the token back.
 */
async function updateBolnaToken(req, res, next) {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token || typeof token !== "string" || token.trim().length === 0) {
      return res.status(400).json({ success: false, message: "A valid token is required" });
    }

    // ── Verify the token against Bolna API before saving ──────────────
    let verifyRes;
    try {
      verifyRes = await fetch(`${BOLNA_API_BASE}/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      return res.status(502).json({
        success: false,
        message: "Could not reach Bolna API. Please check your connection and try again.",
      });
    }

    if (verifyRes.status === 401 || verifyRes.status === 403) {
      return res.status(400).json({
        success: false,
        message: "Invalid Bolna API token. Please check the token and try again.",
        field: "token",
      });
    }

    if (!verifyRes.ok) {
      return res.status(400).json({
        success: false,
        message: "Bolna API rejected the token. Please verify it is correct.",
        field: "token",
      });
    }

    // Parse Bolna account info to cache alongside the token
    let bolnaUserInfo = null;
    try {
      const bolnaBody = await verifyRes.json();
      bolnaUserInfo = {
        bolnaId: bolnaBody.id ?? null,
        name: bolnaBody.name ?? null,
        email: bolnaBody.email ?? null,
        wallet: typeof bolnaBody.wallet === "number" ? bolnaBody.wallet : null,
      };
    } catch {
      // Non-critical — proceed without user info
    }

    // Token is valid — save it with bolna account info
    const result = await updateBolnaTokenService(userId, token, bolnaUserInfo);
    return res.status(200).json({ success: true, ...result, bolnaUserInfo });
  } catch (error) {
    next(error);
  }
}

module.exports = { login, register, logout, refresh, me, updateBolnaToken };

