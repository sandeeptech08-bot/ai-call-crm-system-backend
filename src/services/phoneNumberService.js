const { getBolnaToken } = require("./authService");
const BOLNA_API_BASE = process.env.BOLNA_API_BASE || "https://api.bolna.ai";

/** Fetch a Bolna endpoint; returns parsed JSON or null on any failure/error status. */
async function bolnaGet(path, token) {
  try {
    const res = await fetch(`${BOLNA_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    const data = await res.json().catch(() => null);
    if (!data || data?.success === false || !res.ok) return null;
    return data;
  } catch {
    return null;
  }
}

/** Extract a flat phone-number array from whatever shape Bolna returned. */
function extractList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  for (const key of ["phone_numbers", "numbers", "data", "results", "items"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

/** Normalise a single raw Bolna phone-number object. */
function normalize(p) {
  return {
    id: p.id ?? p.phone_id ?? p._id ?? p.phone_number,
    phone_number: p.phone_number ?? p.phoneNumber ?? p.number ?? "",
    country: p.country ?? p.country_code ?? null,
    telephony_provider: p.telephony_provider ?? p.telephonyProvider ?? p.provider ?? null,
    agent_id: p.agent_id ?? p.agentId ?? null,
    agent_name: p.agent_name ?? p.agentName ?? null,
  };
}

/**
 * Fetch, merge, deduplicate, and return all phone numbers for the user.
 * Sources: /phone-numbers/all, /v2/phone-number, inbound numbers from agents.
 */
async function getPhoneNumbers(userId) {
  const token = await getBolnaToken(userId);
  if (!token) {
    const err = new Error("No Bolna API token configured. Please add your token in settings.");
    err.status = 400;
    throw err;
  }

  const [ownedData, v2Data, agentData] = await Promise.all([
    bolnaGet("/phone-numbers/all", token),
    bolnaGet("/v2/phone-number", token),
    bolnaGet("/v2/agent/all", token),
  ]);

  const rawList = [...extractList(ownedData), ...extractList(v2Data)];

  // Pull inbound numbers from agents as an additional source
  if (Array.isArray(agentData)) {
    for (const agent of agentData) {
      const num = agent.inbound_phone_number ?? null;
      if (num && typeof num === "string" && num.trim()) {
        rawList.push({
          phone_number: num.trim(),
          agent_id: agent.id ?? agent.agent_id ?? null,
          agent_name: agent.agent_name ?? null,
          telephony_provider: agent.tasks?.[0]?.tools_config?.input?.provider ?? null,
        });
      }
    }
  }

  // Build a lookup of phone → agent for enrichment
  const agentByPhone = {};
  if (Array.isArray(agentData)) {
    for (const agent of agentData) {
      if (agent.inbound_phone_number) {
        agentByPhone[agent.inbound_phone_number] = agent;
      }
    }
  }

  // Normalise, enrich, deduplicate by phone_number
  const seen = new Set();
  const list = rawList
    .map((p) => {
      const norm = normalize(p);
      if (!norm.agent_id && agentByPhone[norm.phone_number]) {
        const a = agentByPhone[norm.phone_number];
        norm.agent_id = a.id ?? a.agent_id ?? null;
        norm.agent_name = a.agent_name ?? null;
      }
      return norm;
    })
    .filter((p) => {
      if (!p.phone_number || seen.has(p.phone_number)) return false;
      seen.add(p.phone_number);
      return true;
    });

  return list;
}

module.exports = { getPhoneNumbers };
