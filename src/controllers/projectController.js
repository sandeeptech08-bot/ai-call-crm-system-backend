const { createProject, getProjects, getProject, updateProject, deleteProject } = require("../services/projectService");

/** POST /api/projects */
async function create(req, res, next) {
  try {
    const { name, phoneNumber, agentId, agentName, agentStatus, agentWelcomeMessage, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Project name is required" });
    }

    const project = await createProject(req.user.id, {
      name: name.trim(),
      phoneNumber,
      agentId,
      agentName,
      agentStatus,
      agentWelcomeMessage,
      description,
    });

    return res.status(201).json({ success: true, project });
  } catch (error) {
    next(error);
  }
}

/** GET /api/projects */
async function list(req, res, next) {
  try {
    const { projects, total, page, totalPages } = await getProjects(req.user.id, req.query);
    return res.status(200).json({ success: true, projects, total, page, totalPages });
  } catch (error) {
    next(error);
  }
}

/** GET /api/projects/:id */
async function get(req, res, next) {
  try {
    const project = await getProject(req.user.id, req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    return res.status(200).json({ success: true, project });
  } catch (error) {
    next(error);
  }
}

/** PUT /api/projects/:id */
async function update(req, res, next) {
  try {
    const project = await updateProject(req.user.id, req.params.id, req.body);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    return res.status(200).json({ success: true, project });
  } catch (error) {
    next(error);
  }
}

/** DELETE /api/projects/:id */
async function remove(req, res, next) {
  try {
    const deleted = await deleteProject(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    return res.status(200).json({ success: true, message: "Project deleted" });
  } catch (error) {
    next(error);
  }
}

module.exports = { create, list, get, update, remove };
