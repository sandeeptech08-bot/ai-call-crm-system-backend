require("dotenv").config();

const http = require("http");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { connectDB } = require("./config/db");
const { initSocket } = require("./lib/socket");
const passport = require("./config/passport");
const authRoutes = require("./routes/authRoutes");
const agentRoutes = require("./routes/agentRoutes");
const projectRoutes = require("./routes/projectRoutes");
const phoneNumberRoutes = require("./routes/phoneNumberRoutes");
const leadRoutes = require("./routes/leadRoutes");
const callHistoryRoutes = require("./routes/callHistoryRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const compression = require("compression");
const PORT = parseInt(process.env.PORT || "8080", 10);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const app = express();

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());

// ─── Response Compression ─────────────────────────────────────────────────────
app.use(compression());

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── Body & Cookie Parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(cookieParser());

// ─── Passport (stateless, no session) ────────────────────────────────────────
app.use(passport.initialize());

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);

// ─── Agent Routes ─────────────────────────────────────────────────────────────
app.use("/api/agents", agentRoutes);

// ─── Project Routes ───────────────────────────────────────────────────────────
app.use("/api/projects", projectRoutes);

// ─── Phone Number Routes ──────────────────────────────────────────────────────
app.use("/api/phone-numbers", phoneNumberRoutes);

// ─── Lead Routes ──────────────────────────────────────────────────────────────
app.use("/api/leads", leadRoutes);

// ─── Call History Routes ──────────────────────────────────────────────────────
app.use("/api/call-history", callHistoryRoutes);

// ─── Webhook Routes (no auth — Bolna calls these) ────────────────────────────
app.use("/api/webhook", webhookRoutes);

// ─── Error & 404 Handlers ─────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
const server = http.createServer(app);

// Initialize Socket.io (must be before server.listen)
initSocket(server);

// Start the Bull call worker
require("./workers/callWorker");

server.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || "development"}`);
  console.log(`   CORS origin : ${FRONTEND_URL}`);
});

// Connect to DB after server is up (non-blocking)
connectDB().catch((err) => {
  console.error("❌ Failed to connect to MongoDB:", err.message);
});

// ─── Graceful Shutdown (SIGTERM from Render / SIGINT from Ctrl+C) ─────────────
const { singleLeadCallQueue } = require("./lib/queue");
const { redis } = require("./lib/redis");

async function shutdown(signal) {
  console.log(`\n[shutdown] Received ${signal} — closing gracefully...`);
  server.close(async () => {
    try {
      await singleLeadCallQueue.close();
      redis.disconnect();
      console.log("[shutdown] Clean exit.");
    } catch (err) {
      console.error("[shutdown] Error during cleanup:", err.message);
    }
    process.exit(0);
  });
  // Force-kill if not done in 15 seconds
  setTimeout(() => {
    console.error("[shutdown] Timeout — forcing exit.");
    process.exit(1);
  }, 15_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
