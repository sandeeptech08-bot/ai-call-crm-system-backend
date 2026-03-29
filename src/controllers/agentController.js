const agentService = require("../services/agentService");

function handleServiceError(error, res, next) {
  if (error.status) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }
  next(error);
}

/** POST /api/agents */
async function create(req, res, next) {
  try {
    const data = await agentService.createAgent(req.user.id, req.body);
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

/** GET /api/agents */
async function list(req, res, next) {
  try {
    const agents = await agentService.listAgents(req.user.id);
    return res.status(200).json({ success: true, agents });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

/** GET /api/agents/:id */
async function get(req, res, next) {
  try {
    const agent = await agentService.getAgent(req.user.id, req.params.id);
    return res.status(200).json({ success: true, agent });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

/** PUT /api/agents/:id — full agent update */
async function update(req, res, next) {
  try {
    const data = await agentService.updateAgent(req.user.id, req.params.id, req.body);
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

/** PUT /api/agents/:id/webhook */
async function updateWebhook(req, res, next) {
  try {
    const { webhook_url } = req.body;
    if (!webhook_url || typeof webhook_url !== "string") {
      return res.status(400).json({ success: false, message: "webhook_url is required" });
    }
    const result = await agentService.updateAgentWebhook(req.user.id, req.params.id, webhook_url);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

/** DELETE /api/agents/:id */
async function remove(req, res, next) {
  try {
    const result = await agentService.deleteAgent(req.user.id, req.params.id);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

/** GET /api/agents/voices */
async function voices(req, res, next) {
  try {
    const voiceList = await agentService.getVoices(req.user.id);
    return res.status(200).json({ success: true, voices: voiceList });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

module.exports = { create, list, get, update, updateWebhook, remove, voices };
