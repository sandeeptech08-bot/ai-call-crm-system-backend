const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    /** Hashed password — null for OAuth-only users */
    password: {
      type: String,
      default: null,
    },
    /** Authentication provider: 'credentials' | 'google' */
    provider: {
      type: String,
      enum: ["credentials", "google"],
      default: "credentials",
    },
    googleId: {
      type: String,
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    /** Bolna Platform API token — excluded from default queries for security */
    bolnaToken: {
      type: String,
      default: null,
      select: false,
    },
    /** Cached Bolna account info (name, email, wallet) — populated when token is saved */
    bolnaUserInfo: {
      type: {
        bolnaId: String,
        name: String,
        email: String,
        wallet: Number,
      },
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

/** Hash password before every save (only when modified) */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

/**
 * Compare a plain-text candidate password against the stored hash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

/** Strip password from any JSON serialisation */
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

/** Helper: return a plain public-safe object */
userSchema.methods.toAuthUser = function () {
  return {
    id: this._id.toString(),
    email: this.email,
    name: this.name,
    avatar: this.avatar ?? null,
    hasToken: this.bolnaToken != null,
  };
};

// Avoid OverwriteModelError on hot-reload
module.exports = mongoose.models.User || mongoose.model("User", userSchema);
