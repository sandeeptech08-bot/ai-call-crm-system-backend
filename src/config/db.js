const mongoose = require("mongoose");

let isConnected = false;

/**
 * Connects to MongoDB using the MONGODB_URI environment variable.
 * Reuses the connection if already established (singleton pattern).
 * @returns {Promise<void>}
 */
async function connectDB() {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    console.error("   Check that your current IP is whitelisted in MongoDB Atlas.");
    throw err;
  }
}

module.exports = { connectDB };
