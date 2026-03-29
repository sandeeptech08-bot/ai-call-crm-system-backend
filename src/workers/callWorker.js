const { singleLeadCallQueue } = require("../lib/queue");
const leadRepository = require("../repositories/leadRepository");
const callHistoryRepository = require("../repositories/callHistoryRepository");
const { getBolnaToken } = require("../services/authService");
const { getIO } = require("../lib/socket");
const BOLNA_API_BASE = process.env.BOLNA_API_BASE || "https://api.bolna.ai";

/**
 * Normalise a phone number to E.164 format.
 * – Already E.164 (starts with +) → returned as-is.
 * – 10-digit Indian mobile (starts with 6-9) → prepend +91.
 * – 11-digit number starting with 0 (STD prefix) → strip 0, prepend +91.
 * – Anything else → returned as-is (Bolna will surface the error).
 */
function normalizePhone(raw) {
  if (!raw) return raw;
  const digits = String(raw).replace(/\D/g, "");
  if (String(raw).startsWith("+")) return String(raw).trim();
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return String(raw).trim();
}

/**
 * Worker: processes single-lead-call queue jobs.
 * Each job: fetches lead → builds payload → calls Bolna → creates CallHistory
 *           → updates Lead status → emits socket event.
 */
singleLeadCallQueue.process(async (job) => {
  const { lead_id, user_id } = job.data;

  const lead = await leadRepository.findById(lead_id);
  if (!lead) throw new Error(`Lead ${lead_id} not found`);

  if (!lead.agentId || !lead.phone || !lead.fromPhoneNumber) {
    throw new Error("Lead is missing agentId, phone, or fromPhoneNumber — cannot call");
  }

  const bolnaToken = await getBolnaToken(user_id);
  if (!bolnaToken) throw new Error("Bolna API token not configured for this user");

  const recipientPhone = normalizePhone(lead.phone);
  const fromPhone = normalizePhone(lead.fromPhoneNumber);

  const payload = {
    agent_id: lead.agentId,
    recipient_phone_number: recipientPhone,
    from_phone_number: fromPhone,
    // user_data is echoed back in the Bolna execution as context_details
    user_data: {
      customer_name: lead.leadName,
      lead_id: String(lead_id),
      user_id: String(user_id),
      call_initiated_at: new Date().toISOString(),
    },
  };

  console.log(`[callWorker] 📞 Calling Bolna for lead ${lead_id}: agent_id=${lead.agentId} to=${recipientPhone} from=${fromPhone}`);

  const bolnaRes = await fetch(`${BOLNA_API_BASE}/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bolnaToken}`,
    },
    body: JSON.stringify(payload),
  });

  const bolnaData = await bolnaRes.json().catch(() => ({}));

  if (!bolnaRes.ok) {
    console.error(`[callWorker] ❌ Bolna API rejected call (HTTP ${bolnaRes.status}):`, JSON.stringify(bolnaData));
    const msg = bolnaData?.message || bolnaData?.detail || `Bolna returned HTTP ${bolnaRes.status}`;
    throw new Error(msg);
  }

  console.log(`[callWorker] ✅ Bolna accepted call for lead ${lead_id}:`, JSON.stringify(bolnaData));

  const execution_id = bolnaData.execution_id ?? bolnaData.id ?? null;

  // Upsert CallHistory — this wins over any blank record the webhook may have created first
  if (execution_id) {
    await callHistoryRepository.upsert(
      { execution_id },
      {
        userId: user_id,
        leadId: lead_id,
        agent_id: lead.agentId,
        agent_name: lead.agentName ?? null,
        recipient_phone_number: lead.phone,
        from_phone_number: lead.fromPhoneNumber,
        status: "initiated",
      }
    ).catch((err) => console.warn("[callWorker] CallHistory upsert warning:", err.message));
  }

  // Update lead status
  await leadRepository.updateById(lead_id, {
    $set: { call_status: "initiated", lastCallAt: new Date() },
    $inc: { call_attempt_count: 1 },
  });

  // Real-time push to the user's browser
  const io = getIO();
  if (io) {
    io.to(`user:${user_id}`).emit("lead:call:initiated", {
      leadId: lead_id,
      status: "initiated",
      execution_id,
    });
  }

  console.log(`[callWorker] ✅ Call initiated for lead ${lead_id}, execution_id: ${execution_id}`);
  return { execution_id, status: "initiated" };
});

// On permanent failure (all retries exhausted)
singleLeadCallQueue.on("failed", (job, err) => {
  const { lead_id, user_id } = job.data;
  console.error(`[callWorker] ❌ Job permanently failed for lead ${lead_id}:`, err.message);

  leadRepository.updateById(lead_id, { $set: { call_status: "failed" } }).catch(() => {});

  const io = getIO();
  if (io) {
    io.to(`user:${user_id}`).emit("lead:call:failed", {
      leadId: lead_id,
      status: "failed",
      error: err.message,
    });
  }
});

singleLeadCallQueue.on("error", (err) => {
  console.error("[callWorker] Queue error:", err.message);
});

console.log("[callWorker] ✅ Call worker registered and listening");
