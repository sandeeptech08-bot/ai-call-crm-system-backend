const Redis = require("ioredis");
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ioredis auto-detects TLS when the URL uses the rediss:// scheme (Render Key Value)
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  lazyConnect: true,          // don't connect until first command
  enableOfflineQueue: false,  // don't queue commands while disconnected
  retryStrategy: (times) => {
    // Exponential back-off, max 5 attempts in production
    if (times > 5) return null;
    return Math.min(times * 500, 3000);
  },
});

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("❌ Redis error:", err.message));

module.exports = { redis };
