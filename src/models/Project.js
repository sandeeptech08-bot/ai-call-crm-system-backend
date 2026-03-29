const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    /** Owner — references the User who created this project */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
      maxlength: [100, "Project name cannot exceed 100 characters"],
    },
    /** Primary contact phone number for this project */
    phoneNumber: {
      type: String,
      default: null,
      trim: true,
    },
    /** Bolna agent ID linked to this project */
    agentId: {
      type: String,
      default: null,
    },
    /** Cached agent details from Bolna API (refreshed on load) */
    agentName: {
      type: String,
      default: null,
    },
    agentStatus: {
      type: String,
      default: null,
    },
    agentWelcomeMessage: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: null,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Project || mongoose.model("Project", projectSchema);
