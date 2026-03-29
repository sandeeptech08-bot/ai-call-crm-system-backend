const callHistoryRepository = require("../repositories/callHistoryRepository");
const leadRepository = require("../repositories/leadRepository");
const { getIO } = require("../lib/socket");
const { scheduleCallback } = require("../scheduler/callbackScheduler");

/** Bolna sends hyphens (call-disconnected, no-answer); DB uses underscores. */
function normalizeStatus(status) {
  if (!status) return null;
  return String(status).replace(/-/g, "_").toLowerCase();
}

/**
 * Extract user_id and lead_id from the Bolna webhook payload.
 * Bolna echoes user_data back as context_details in the execution response.
 */
function extractIds(webhookData) {
  const ctx = webhookData?.context_details ?? webhookData?.user_data ?? {};
  return {
    userId: ctx.user_id ?? webhookData.user_id ?? null,
    leadId: ctx.lead_id ?? webhookData.lead_id ?? null,
  };
}

/**
 * Process a Bolna webhook payload:
 *  1. Upsert CallHistory record
 *  2. Update Lead status (if IDs are available)
 *  3. Emit real-time socket event to the user's browser
 */
async function processWebhook(webhookData) {
  const execution_id =
    webhookData.id ??
    webhookData.execution_id ??
    webhookData.executionId ??
    webhookData.call_id;

  if (!execution_id) {
    console.warn("[webhook] No execution_id in payload — skipped");
    return;
  }

  const status = normalizeStatus(webhookData.status ?? webhookData.call_status);

  // ── Extract all relevant fields from the Bolna payload ────────────────────
  if (status === "error" || status === "failed") {
    console.error(`[webhook] ❌ Error/failed webhook received:`, JSON.stringify(webhookData));
  } else {
    console.log(`[webhook] Incoming: status=${status}, execution_id=${execution_id}`);
  }

  const call_duration =
    webhookData.conversation_time ??
    webhookData.telephony_data?.duration ??
    webhookData.call_duration ??
    0;

  const transcript = webhookData.transcript ?? webhookData.transcription ?? "";

  // recording_url lives in telephony_data per Bolna docs
  const recording_url =
    webhookData.telephony_data?.recording_url ??
    webhookData.recording_url ??
    "";

  const hangup_by =
    webhookData.telephony_data?.hangup_by ??
    webhookData.hangup_by ??
    null;

  const hangup_reason =
    webhookData.telephony_data?.hangup_reason ??
    webhookData.hangup_reason ??
    null;

  // Error/failure reason from Bolna or Twilio telephony layer
  const error_message =
    webhookData.error_message ??
    webhookData.error ??
    webhookData.telephony_data?.error_message ??
    webhookData.telephony_data?.error ??
    webhookData.telephony_data?.error_code ??
    webhookData.reason ??
    null;

  const extracted_data = webhookData.extracted_data ?? webhookData.data ?? null;

  const { userId, leadId } = extractIds(webhookData);

  // ── Build the upsert fields ───────────────────────────────────────────────
  const fields = {
    status,
    call_duration,
    raw_webhook: webhookData,
    ...(transcript ? { transcript } : {}),
    ...(recording_url ? { recording_url } : {}),
    ...(hangup_by ? { hangup_by } : {}),
    ...(hangup_reason ? { hangup_reason } : {}),
    ...(error_message ? { error_message } : {}),
    ...(extracted_data ? { extracted_data } : {}),
    ...(status === "completed" || status === "call_disconnected"
      ? { completed_at: new Date() }
      : {}),
  };

  // Always set phone/agent fields from the Bolna payload
  const agentId = webhookData.agent_id ?? webhookData.agentId ?? null;
  const agentName = webhookData.assistant_name ?? webhookData.agent_name ?? null;
  const toNumber =
    webhookData.telephony_data?.to_number ??
    webhookData.to ??
    webhookData.recipient_phone_number ??
    null;
  const fromNumber =
    webhookData.telephony_data?.from_number ??
    webhookData.from ??
    webhookData.from_phone_number ??
    null;

  if (agentId) fields.agent_id = agentId;
  if (agentName) fields.agent_name = agentName;
  if (toNumber) fields.recipient_phone_number = toNumber;
  if (fromNumber) fields.from_phone_number = fromNumber;
  if (userId) fields.userId = userId;
  if (leadId) fields.leadId = leadId;

  // ── Upsert CallHistory ────────────────────────────────────────────────────
  const callHistory = await callHistoryRepository.upsert({ execution_id }, fields);

  // Resolve IDs: prefer webhook payload, fall back to what's on the saved record
  const finalLeadId = leadId ?? String(callHistory?.leadId ?? "");
  const finalUserId = userId ?? String(callHistory?.userId ?? "");

  if (!finalLeadId || !finalUserId) {
    console.log(`[webhook] ${execution_id} → ${status} (no lead/user ID yet; call history updated)`);
    return;
  }

  // ── Update Lead status ────────────────────────────────────────────────────
  const terminalStatuses = ["completed", "call_disconnected", "failed", "no_answer", "busy", "cancelled"];
  const leadUpdate = { call_status: status, lastCallAt: new Date() };

  if (terminalStatuses.includes(status) && extracted_data) {
    // Bolna sends snake_case keys — support both snake_case and camelCase
    const interestRaw =
      extracted_data.customer_interest_level ??
      extracted_data.customerInterestLevel ??
      null;
    if (interestRaw) {
      const normalized = String(interestRaw).toLowerCase().trim();
      if (["high", "medium", "low"].includes(normalized)) {
        leadUpdate.aiRecommendInterest = normalized;
      }
    }

    const outcomeRaw =
      extracted_data.call_outcome ??
      extracted_data.callOutcome ??
      null;
    if (outcomeRaw) {
      leadUpdate.leadCallStatus = String(outcomeRaw).toUpperCase().trim();
    }

    const callbackRequested =
      extracted_data.call_back_requested ??
      extracted_data.callBackRequested ??
      null;
    const callbackRequiredFlag =
      callbackRequested === true ||
      String(callbackRequested).toUpperCase() === "YES";
    if (callbackRequiredFlag) {
      leadUpdate.callbackRequired = true;

      const callbackTimeRaw =
        extracted_data.call_back_time ??
        extracted_data.callBackTime ??
        null;

      // Schedule via callbackScheduler (handles window + parsing)
      const scheduledAt = await scheduleCallback(finalLeadId, finalUserId, callbackTimeRaw)
        .catch((err) => {
          console.warn("[webhook] Failed to schedule callback:", err.message);
          return null;
        });

      if (scheduledAt) {
        leadUpdate.callbackAt = scheduledAt;
      }
    }
  }

  // ── (Callback already queued inside scheduleCallback above) ──────────────

  // ── Persist lead status update to DB ─────────────────────────────────────
  // This is the critical step that was missing — without it the lead table
  // never reflects the final call outcome (especially visible after callbacks).
  await leadRepository.updateById(finalLeadId, { $set: leadUpdate }).catch((err) => {
    console.error(`[webhook] ⚠ Failed to update lead ${finalLeadId}:`, err.message);
  });

  // ── Emit real-time socket event ───────────────────────────────────────────
  const io = getIO();
  if (io) {
    io.to(`user:${finalUserId}`).emit("lead:status:updated", {
      leadId: finalLeadId,
      status,
      execution_id,
      recording_url,
      transcript: Boolean(transcript),
      extracted_data,
      aiRecommendInterest: leadUpdate.aiRecommendInterest ?? null,
      leadCallStatus: leadUpdate.leadCallStatus ?? null,
      callbackRequired: leadUpdate.callbackRequired ?? null,
      callbackAt: leadUpdate.callbackAt ? leadUpdate.callbackAt.toISOString() : null,
    });
  }

  console.log(`[webhook] ✅ ${execution_id} → ${status}`);
}

module.exports = { processWebhook };
