const mongoose = require("mongoose");

const callHistorySchema = new mongoose.Schema(
  {
    /** Bolna's unique call execution identifier */
    execution_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      required: false,
      index: true,
    },

    // ─── Agent / Phone ────────────────────────────────────────────────────────
    agent_id: {
      type: String,
      default: null,
    },
    agent_name: {
      type: String,
      default: null,
    },
    recipient_phone_number: {
      type: String,
      default: null,
    },
    from_phone_number: {
      type: String,
      default: null,
    },

    // ─── Call outcome ─────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "queued",
        "initiated",
        "ringing",
        "in_progress",
        "call_disconnected",
        "completed",
        "failed",
        "error",
        "no_answer",
        "busy",
        "cancelled",
      ],
      default: "queued",
      index: true,
    },
    call_duration: {
      type: Number,
      default: 0,
    },

    // ─── Telephony detail ─────────────────────────────────────────────────────
    hangup_by: {
      type: String,
      default: null,
    },
    hangup_reason: {
      type: String,
      default: null,
    },

    // ─── Content ──────────────────────────────────────────────────────────────
    transcript: {
      type: String,
      default: "",
    },
    recording_url: {
      type: String,
      default: "",
    },

    /** AI-extracted structured data from the call */
    extracted_data: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    /** Error message from Bolna/Twilio when status is "error" or "failed" */
    error_message: {
      type: String,
      default: null,
    },
    /** Full raw webhook body */
    raw_webhook: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    scheduled_at: {
      type: Date,
      default: Date.now,
    },
    completed_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

callHistorySchema.index({ userId: 1, createdAt: -1 });
callHistorySchema.index({ leadId: 1, createdAt: -1 });
callHistorySchema.index({ userId: 1, status: 1, createdAt: -1 });
// Speed up phone-number search queries
callHistorySchema.index({ recipient_phone_number: 1 });
callHistorySchema.index({ from_phone_number: 1 });

module.exports = mongoose.models.CallHistory || mongoose.model("CallHistory", callHistorySchema);
