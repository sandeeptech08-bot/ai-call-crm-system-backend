const leadRepository = require("../repositories/leadRepository");
const { getBolnaToken } = require("./authService");
const { singleLeadCallQueue } = require("../lib/queue");

const CALL_STATUSES = [
  "pending", "queued", "initiated", "ringing", "in_progress",
  "completed", "call_disconnected", "failed", "error", "no_answer", "busy", "cancelled",
];

/**
 * Build a Mongoose filter object from request query params.
 */
function buildFilter(userId, query) {
  const filter = { userId };

  if (query.search) {
    const re = new RegExp(query.search.trim(), "i");
    filter.$or = [
      { leadName: re },
      { phone: re },
      { email: re },
    ];
  }

  if (query.call_status && CALL_STATUSES.includes(query.call_status)) {
    filter.call_status = query.call_status;
  }

  if (query.ai_interest && ["high", "medium", "low"].includes(query.ai_interest)) {
    filter.aiRecommendInterest = query.ai_interest;
  }

  if (query.call_outcome) {
    filter.leadCallStatus = query.call_outcome;
  }

  if (query.project_id) {
    filter.projectId = query.project_id;
  }

  return filter;
}

async function createLead(userId, body) {
  const { leadName, phone, email, notes, source, projectId, projectName, agentId, agentName, phoneNumberId, fromPhoneNumber } = body;

  if (!leadName || !phone || !projectId) {
    const err = new Error("leadName, phone, and projectId are required");
    err.status = 400;
    throw err;
  }

  const lead = await leadRepository.create({
    userId,
    leadName: leadName.trim(),
    phone: phone.trim(),
    email: email?.trim() ?? "",
    notes: notes?.trim() ?? "",
    source: source ?? "manual",
    projectId,
    projectName: projectName ?? null,
    agentId: agentId ?? null,
    agentName: agentName ?? null,
    phoneNumberId: phoneNumberId ?? null,
    fromPhoneNumber: fromPhoneNumber ?? null,
  });

  // Auto-enqueue background call if lead is fully configured
  if (lead.agentId && lead.fromPhoneNumber) {
    setImmediate(() => {
      singleLeadCallQueue
        .add({ lead_id: lead._id.toString(), user_id: String(userId) })
        .catch((err) => console.error("[queue] Failed to enqueue call:", err.message));
    });
  }

  return lead;
}

async function getLeads(userId, query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const skip = (page - 1) * limit;

  const filter = buildFilter(userId, query);

  const [leads, total] = await Promise.all([
    leadRepository.find(filter, { skip, limit }),
    leadRepository.count(filter),
  ]);

  return { leads, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getLead(userId, leadId) {
  return leadRepository.findOne({ _id: leadId, userId });
}

async function updateLead(userId, leadId, body) {
  const allowed = [
    "leadName", "phone", "email", "notes", "source",
    "agentId", "agentName", "phoneNumberId", "fromPhoneNumber",
    "call_status", "leadCallStatus", "aiRecommendInterest",
    "callbackRequired", "callbackAt", "projectName",
  ];
  const update = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  return leadRepository.updateOne(
    { _id: leadId, userId },
    { $set: update },
    { runValidators: true }
  );
}

async function deleteLead(userId, leadId) {
  return leadRepository.deleteOne({ _id: leadId, userId });
}

/**
 * Initiate an outbound call for a given lead via the Bull queue.
 * Replaces the old direct-Bolna approach — returns immediately.
 */
async function initiateCall(userId, leadId) {
  const lead = await leadRepository.findById(leadId);
  if (!lead) {
    const err = new Error("Lead not found"); err.status = 404; throw err;
  }
  if (!lead.agentId) {
    const err = new Error("Lead has no agent assigned. Assign an agent before calling."); err.status = 400; throw err;
  }
  if (!lead.phone) {
    const err = new Error("Lead has no phone number."); err.status = 400; throw err;
  }
  if (!lead.fromPhoneNumber) {
    const err = new Error("No outbound phone number set on this lead. Edit the lead to set one."); err.status = 400; throw err;
  }

  await singleLeadCallQueue.add({ lead_id: String(leadId), user_id: String(userId) });

  await leadRepository.updateById(leadId, { $set: { call_status: "queued" } });

  return { status: "queued", message: "Call queued — will be placed shortly" };
}

module.exports = { createLead, getLeads, getLead, updateLead, deleteLead, initiateCall };

