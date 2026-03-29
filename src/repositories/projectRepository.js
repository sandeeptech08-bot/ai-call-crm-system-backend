const Project = require("../models/Project");

/**
 * Create a new project document.
 */
async function create(data) {
  return Project.create(data);
}

/**
 * Find a single project by filter.
 */
async function findOne(filter) {
  return Project.findOne(filter).lean();
}

/**
 * Find multiple projects with optional sort and pagination.
 */
async function find(filter, { sort = { createdAt: -1 }, skip = 0, limit } = {}) {
  const q = Project.find(filter).sort(sort).skip(skip);
  if (limit) q.limit(limit);
  return q.lean();
}

/**
 * Count documents matching a filter.
 */
async function count(filter) {
  return Project.countDocuments(filter);
}

/**
 * Update a single project by filter — wraps update in $set automatically.
 */
async function updateOne(filter, fields) {
  return Project.findOneAndUpdate(filter, { $set: fields }, { new: true, runValidators: true }).lean();
}

/**
 * Delete a single project by filter.
 * Returns true if a document was deleted.
 */
async function deleteOne(filter) {
  const result = await Project.deleteOne(filter);
  return result.deletedCount > 0;
}

module.exports = { create, findOne, find, count, updateOne, deleteOne };
