const projectRepository = require("../repositories/projectRepository");

/**
 * Create a new project for a user.
 */
async function createProject(userId, { name, phoneNumber, agentId, agentName, agentStatus, agentWelcomeMessage, description }) {
  return projectRepository.create({
    userId,
    name,
    phoneNumber: phoneNumber || null,
    agentId: agentId || null,
    agentName: agentName || null,
    agentStatus: agentStatus || null,
    agentWelcomeMessage: agentWelcomeMessage || null,
    description: description || null,
  });
}

/**
 * List projects with optional search + pagination.
 */
async function getProjects(userId, query = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const skip = (page - 1) * limit;

  const filter = { userId };
  if (query.search) {
    const re = new RegExp(query.search.trim(), "i");
    filter.$or = [{ name: re }, { agentName: re }, { phoneNumber: re }];
  }

  const [projects, total] = await Promise.all([
    projectRepository.find(filter, { skip, limit }),
    projectRepository.count(filter),
  ]);

  return { projects, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get a single project by ID, ensuring it belongs to the requesting user.
 */
async function getProject(userId, projectId) {
  return projectRepository.findOne({ _id: projectId, userId });
}

/**
 * Update an existing project. Only the owner can update.
 */
async function updateProject(userId, projectId, updates) {
  const allowed = ["name", "phoneNumber", "agentId", "agentName", "agentStatus", "agentWelcomeMessage", "description"];
  const filtered = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }
  return projectRepository.updateOne({ _id: projectId, userId }, filtered);
}

/**
 * Delete a project by ID. Only the owner can delete.
 */
async function deleteProject(userId, projectId) {
  return projectRepository.deleteOne({ _id: projectId, userId });
}

module.exports = { createProject, getProjects, getProject, updateProject, deleteProject };
