const CallHistory = require("../models/CallHistory");

const LEAD_POPULATE = { path: "leadId", select: "leadName phone email projectName" };

/**
 * Upsert a call history record by filter (usually { execution_id }).
 * Creates a new record if none exists, otherwise updates in place.
 */
async function upsert(filter, fields) {
  return CallHistory.findOneAndUpdate(filter, { $set: fields }, { upsert: true, new: true });
}

/**
 * Find a single call history record with lead populated.
 * Includes raw_webhook for detail views.
 */
async function findOne(filter) {
  return CallHistory.findOne(filter).populate(LEAD_POPULATE).lean();
}

/**
 * Find multiple call history records with lead populated.
 * Excludes raw_webhook for list performance.
 */
async function find(filter, { sort = { createdAt: -1 }, skip = 0, limit = 25 } = {}) {
  return CallHistory.find(filter)
    .populate(LEAD_POPULATE)
    .select("-raw_webhook")
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
}

/**
 * Count call history records matching a filter.
 */
async function count(filter) {
  return CallHistory.countDocuments(filter);
}

module.exports = { upsert, findOne, find, count };
