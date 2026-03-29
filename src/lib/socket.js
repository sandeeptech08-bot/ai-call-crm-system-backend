const { Server } = require("socket.io");
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

let io;

/**
 * Initialize Socket.io on the given HTTP server.
 * Call this once in index.js after creating the http.Server.
 */
function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: FRONTEND_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    // Client emits "join" with their userId to enter their private room
    socket.on("join", (userId) => {
      if (typeof userId === "string" && userId.trim().length > 0) {
        socket.join(`user:${userId}`);
        console.log(`[socket] ${socket.id} joined room user:${userId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[socket] ${socket.id} disconnected`);
    });
  });

  console.log("[socket] ✅ Socket.io initialized");
  return io;
}

/** Returns the Socket.io Server instance. Returns undefined if not yet initialized. */
function getIO() {
  return io;
}

module.exports = { initSocket, getIO };
