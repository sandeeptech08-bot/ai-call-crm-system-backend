const { getBolnaToken } = require("./authService");
const BOLNA_API_BASE = process.env.BOLNA_API_BASE || "https://api.bolna.ai";

/**
 * Retrieve the user's Bolna token, throwing a 400 error if missing.
 */
async function getToken(userId) {
  const token = await getBolnaToken(userId);
  if (!token) {
    const err = new Error("No Bolna API token configured. Please add your token in settings.");
    err.status = 400;
    throw err;
  }
  return token;
}

/**
 * Create a new agent on Bolna.
 */
async function createAgent(userId, agentData) {
  const token = await getToken(userId);
  const res = await fetch(`${BOLNA_API_BASE}/v2/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(agentData),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.message ?? "Bolna API error");
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

/**
 * List all agents from Bolna.
 */
async function listAgents(userId) {
  const token = await getToken(userId);
  const res = await fetch(`${BOLNA_API_BASE}/v2/agent/all`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.message ?? "Bolna API error");
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

/**
 * Get a single agent by ID from Bolna.
 */
async function getAgent(userId, agentId) {
  const token = await getToken(userId);
  const res = await fetch(`${BOLNA_API_BASE}/v2/agent/${encodeURIComponent(agentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.message ?? "Bolna API error");
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

/**
 * Full update of a Bolna agent (PUT /v2/agent/:id).
 * Body: { agent_config, agent_prompts } — same shape as create.
 */
async function updateAgent(userId, agentId, agentData) {
  const token = await getToken(userId);
  const res = await fetch(`${BOLNA_API_BASE}/v2/agent/${encodeURIComponent(agentId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(agentData),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message ?? "Bolna API error");
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

/**
 * Update the webhook URL on a Bolna agent.
 * Bolna PATCH /v2/agent/:id requires the URL nested inside agent_config.
 */
async function updateAgentWebhook(userId, agentId, webhookUrl) {
  const token = await getToken(userId);
  const res = await fetch(`${BOLNA_API_BASE}/v2/agent/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ agent_config: { webhook_url: webhookUrl } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message ?? "Failed to update agent webhook URL");
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return { message: "Webhook URL updated" };
}

/**
 * List all voices imported into the user's Bolna Voice Lab.
 */
async function getVoices(userId) {
  const token = await getToken(userId);
  const res = await fetch(`${BOLNA_API_BASE}/me/voices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    const err = new Error("Failed to parse voices response from Bolna");
    err.status = 502;
    throw err;
  }
  if (!res.ok) {
    console.error("[getVoices] Bolna API error:", res.status, JSON.stringify(data));
    const err = new Error(data?.message ?? `Failed to fetch voices from Bolna (${res.status})`);
    err.status = res.status;
    throw err;
  }
  console.log("[getVoices] Bolna response keys:", Object.keys(data ?? {}), "isArray:", Array.isArray(data));
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.voices)) return data.voices;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.voice_list)) return data.voice_list;
  console.warn("[getVoices] Could not extract voice list from response:", JSON.stringify(data).slice(0, 300));
  return [];
}

/**
 * Delete a Bolna agent.
 */
async function deleteAgent(userId, agentId) {
  const token = await getToken(userId);
  const res = await fetch(`${BOLNA_API_BASE}/v2/agent/${encodeURIComponent(agentId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) {
    const err = new Error("Agent not found");
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data?.message ?? "Failed to delete agent");
    err.status = res.status;
    throw err;
  }
  return { message: "Agent deleted" };
}

module.exports = { createAgent, listAgents, getAgent, updateAgent, updateAgentWebhook, deleteAgent, getVoices };
