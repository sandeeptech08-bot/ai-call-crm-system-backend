const leadService = require("../services/leadService");

async function create(req, res, next) {
  try {
    const lead = await leadService.createLead(req.user.id, req.body);
    return res.status(201).json({ success: true, lead });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
}

async function list(req, res, next) {
  try {
    const result = await leadService.getLeads(req.user.id, req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const lead = await leadService.getLead(req.user.id, req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    return res.status(200).json({ success: true, lead });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    const lead = await leadService.updateLead(req.user.id, req.params.id, req.body);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    return res.status(200).json({ success: true, lead });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    const deleted = await leadService.deleteLead(req.user.id, req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Lead not found" });
    return res.status(200).json({ success: true, message: "Lead deleted" });
  } catch (error) {
    next(error);
  }
}

async function callLead(req, res, next) {
  try {
    const result = await leadService.initiateCall(req.user.id, req.params.id);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
}

module.exports = { create, list, get, update, remove, callLead };

