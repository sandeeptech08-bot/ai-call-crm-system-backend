const { Router } = require("express");
const { rateLimit } = require("express-rate-limit");
const { login, register, logout, refresh, me, updateBolnaToken } = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");
const passport = require("../config/passport");

const router = Router();

/** Rate limiter: 10 login attempts per 15 min per IP */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
});

/** Rate limiter: 60 refresh attempts per 15 min per IP */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many refresh requests. Please try again later.",
  },
});

// POST /api/auth/register
router.post("/register", loginLimiter, register);

// POST /api/auth/login
router.post("/login", loginLimiter, login);

// POST /api/auth/refresh
router.post("/refresh", refreshLimiter, refresh);

// POST /api/auth/logout  (protected)
router.post("/logout", requireAuth, logout);

// GET /api/auth/me  (protected)
router.get("/me", requireAuth, me);

// PATCH /api/auth/bolna-token  (protected) — save user's Bolna API token
router.patch("/bolna-token", requireAuth, updateBolnaToken);

// GET /api/auth/google  → redirects user to Google consent screen
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

// GET /api/auth/google/callback  → Google redirects here after consent
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=OAuthFailed`,
  }),
  (req, res) => {
    const { user, accessToken } = req.user;
    const params = new URLSearchParams({
      token: accessToken,
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ?? "",
    });
    res.redirect(`${process.env.FRONTEND_URL}/auth/google/callback?${params}`);
  }
);

module.exports = router;
