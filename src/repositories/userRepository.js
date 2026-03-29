const User = require("../models/User");

/**
 * Find a user by email (always selects bolnaToken for internal use).
 */
async function findByEmail(email) {
  return User.findOne({ email: email.toLowerCase().trim() }).select("+bolnaToken");
}

/**
 * Find a user by MongoDB _id (always selects bolnaToken for internal use).
 */
async function findById(id) {
  return User.findById(id).select("+bolnaToken");
}

/**
 * Find a user by Google ID or email — used for OAuth upsert.
 */
async function findByEmailOrGoogleId(email, googleId) {
  return User.findOne({ $or: [{ googleId }, { email }] }).select("+bolnaToken");
}

/**
 * Create a new user document.
 */
async function create(data) {
  return User.create(data);
}

/**
 * Update a user by ID with arbitrary fields.
 */
async function updateById(id, data) {
  return User.findByIdAndUpdate(id, data, { new: true }).select("+bolnaToken");
}

module.exports = { findByEmail, findById, findByEmailOrGoogleId, create, updateById };
