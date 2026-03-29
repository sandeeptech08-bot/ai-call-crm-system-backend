const Lead = require("../models/Lead");

/**
 * Create a new lead document.
 */
async function create(data) {
  return Lead.create(data);
}

/**
 * Find a single lead by filter.
 */
async function findOne(filter) {
  return Lead.findOne(filter).lean();
}

/**
 * Find a lead by its _id.
 */
async function findById(id) {
  return Lead.findById(id).lean();
}

/**
 * Find multiple leads with optional sort/skip/limit.
 */
async function find(filter, { sort = { createdAt: -1 }, skip = 0, limit = 25 } = {}) {
  return Lead.find(filter).sort(sort).skip(skip).limit(limit).lean();
}

/**
 * Count leads matching a filter.
 */
async function count(filter) {
  return Lead.countDocuments(filter);
}

/**
 * Update a lead by _id using a raw MongoDB update object.
 * Caller is responsible for using $set, $inc etc. as needed.
 */
async function updateById(id, rawUpdate) {
  return Lead.findByIdAndUpdate(id, rawUpdate, { new: true }).lean();
}

/**
 * Update a single lead by filter using a raw MongoDB update object.
 */
async function updateOne(filter, rawUpdate, options = {}) {
  return Lead.findOneAndUpdate(filter, rawUpdate, { new: true, ...options }).lean();
}

/**
 * Delete a single lead by filter.
 * Returns true if a document was deleted.
 */
async function deleteOne(filter) {
  const result = await Lead.deleteOne(filter);
  return result.deletedCount > 0;
}

module.exports = { create, findOne, findById, find, count, updateById, updateOne, deleteOne };
