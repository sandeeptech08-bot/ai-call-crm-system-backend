require("dotenv").config();

const http = require("http");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

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

// ─── Health Check (registered first — before anything that can crash) ─────────
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// ─── HTTP Server — bind immediately so Railway healthcheck passes ──────────────
const server = http.createServer(app);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || "development"}`);
  console.log(`   CORS origin : ${FRONTEND_URL}`);

  // ─── Load routes & services AFTER server is listening ───────────────────────
  try {
    const passport = require("./config/passport");
    app.use(passport.initialize());

    const authRoutes = require("./routes/authRoutes");
    const agentRoutes = require("./routes/agentRoutes");
    const projectRoutes = require("./routes/projectRoutes");
    const phoneNumberRoutes = require("./routes/phoneNumberRoutes");
    const leadRoutes = require("./routes/leadRoutes");
    const callHistoryRoutes = require("./routes/callHistoryRoutes");
    const webhookRoutes = require("./routes/webhookRoutes");

    // ─── Auth Routes ────────────────────────────────────────────────────────────
    app.use("/api/auth", authRoutes);

    // ─── Agent Routes ───────────────────────────────────────────────────────────
    app.use("/api/agents", agentRoutes);

    // ─── Project Routes ─────────────────────────────────────────────────────────
    app.use("/api/projects", projectRoutes);

    // ─── Phone Number Routes ────────────────────────────────────────────────────
    app.use("/api/phone-numbers", phoneNumberRoutes);

    // ─── Lead Routes ────────────────────────────────────────────────────────────
    app.use("/api/leads", leadRoutes);

    // ─── Call History Routes ────────────────────────────────────────────────────
    app.use("/api/call-history", callHistoryRoutes);

    // ─── Webhook Routes (no auth — Bolna calls these) ───────────────────────────
    app.use("/api/webhook", webhookRoutes);

    // ─── Error & 404 Handlers ───────────────────────────────────────────────────
    app.use(notFoundHandler);
    app.use(errorHandler);

    // ─── Socket.io ──────────────────────────────────────────────────────────────
    const { initSocket } = require("./lib/socket");
    initSocket(server);

    // ─── Bull call worker ───────────────────────────────────────────────────────
    require("./workers/callWorker");

    // ─── MongoDB (non-blocking) ─────────────────────────────────────────────────
    const { connectDB } = require("./config/db");
    connectDB().catch((err) => {
      console.error("❌ Failed to connect to MongoDB:", err.message);
    });

    console.log("✅ All routes and services initialised");
  } catch (err) {
    console.error("❌ Startup error (server still running):", err.message);
  }
});

// ─── Global error guards — prevent process from dying on unhandled errors ──────
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
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
