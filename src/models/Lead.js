const mongoose = require("mongoose");

const CALL_STATUSES = [
  "pending",
  "queued",
  "initiated",
  "ringing",
  "in_progress",
  "completed",
  "call_disconnected",
  "failed",
  "error",
  "no_answer",
  "busy",
  "cancelled",
];

const LEAD_OUTCOMES = [
  "INTERESTED",
  "NOT_INTERESTED",
  "CALLBACK",
  "FOLLOW_UP",
  "DEMO_BOOKED",
  "WRONG_NUMBER",
  "DND",
  "NO_ANSWER",
  "BUSY",
  "NOT_REACHABLE",
  "VOICEMAIL",
  "NO_OUTCOME",
  null,
];

const leadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ─── Basic info ──────────────────────────────────────────────────────────
    leadName: {
      type: String,
      required: [true, "Lead name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    notes: {
      type: String,
      default: "",
    },
    source: {
      type: String,
      enum: ["manual", "csv_upload", "api", "other"],
      default: "manual",
    },

    // ─── Project linkage ─────────────────────────────────────────────────────
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project is required"],
      index: true,
    },
    projectName: {
      type: String,
      default: null,
    },

    // ─── Assistant linkage ───────────────────────────────────────────────────
    agentId: {
      type: String,
      default: null,
    },
    agentName: {
      type: String,
      default: null,
    },

    // ─── Phone number used for calling ───────────────────────────────────────
    phoneNumberId: {
      type: String,
      default: null,
    },
    fromPhoneNumber: {
      type: String,
      default: null,
    },

    // ─── Call tracking ───────────────────────────────────────────────────────
    call_status: {
      type: String,
      enum: CALL_STATUSES,
      default: "pending",
      index: true,
    },
    leadCallStatus: {
      type: String,
      enum: LEAD_OUTCOMES,
      default: null,
      index: true,
    },
    aiRecommendInterest: {
      type: String,
      enum: ["high", "medium", "low", null],
      default: null,
    },
    callbackRequired: {
      type: Boolean,
      default: false,
    },
    callbackAt: {
      type: Date,
      default: null,
    },
    call_attempt_count: {
      type: Number,
      default: 0,
    },
    lastCallAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

leadSchema.index({ userId: 1, createdAt: -1 });
leadSchema.index({ projectId: 1, userId: 1 });

module.exports = mongoose.models.Lead || mongoose.model("Lead", leadSchema);
