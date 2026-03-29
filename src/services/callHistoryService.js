const callHistoryRepository = require("../repositories/callHistoryRepository");

async function getCallHistory(userId, query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const skip = (page - 1) * limit;

  const filter = { userId };

  if (query.status) filter.status = query.status;
  if (query.lead_id) filter.leadId = query.lead_id;

  if (query.search) {
    const re = new RegExp(query.search.trim(), "i");
    filter.$or = [{ recipient_phone_number: re }, { from_phone_number: re }];
  }

  const [callHistory, total] = await Promise.all([
    callHistoryRepository.find(filter, { skip, limit }),
    callHistoryRepository.count(filter),
  ]);

  return { callHistory, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get a single call history record with full details (including raw_webhook).
 */
async function getCallHistoryRecord(userId, id) {
  return callHistoryRepository.findOne({ _id: id, userId });
}

module.exports = { getCallHistory, getCallHistoryRecord };
