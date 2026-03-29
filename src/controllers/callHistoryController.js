const callHistoryService = require("../services/callHistoryService");
const { getBolnaToken } = require("../services/authService");
const BOLNA_API_BASE = process.env.BOLNA_API_BASE || "https://api.bolna.ai";

/** GET /api/call-history */
async function list(req, res, next) {
  try {
    const result = await callHistoryService.getCallHistory(req.user.id, req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

/** GET /api/call-history/:id */
async function get(req, res, next) {
  try {
    const record = await callHistoryService.getCallHistoryRecord(req.user.id, req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
    return res.status(200).json({ success: true, record });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/call-history/:id/recording
 *
 * Strategy:
 *  1. Use the stored execution_id to fetch the Bolna execution details.
 *  2. Pull recording_url from telephony_data (Bolna stores it on S3 — no Twilio auth needed).
 *  3. Redirect the client to that public S3 URL.
 *  4. Fall back to streaming the stored recording_url directly if Bolna API is unavailable.
 */
async function getRecording(req, res, next) {
  try {
    const record = await callHistoryService.getCallHistoryRecord(req.user.id, req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    const bolnaToken = await getBolnaToken(req.user.id);

    // ── Step 1: try to get the S3 recording URL from Bolna executions API ──
    let recordingUrl = null;
    if (bolnaToken && record.execution_id) {
      try {
        const execRes = await fetch(
          `${BOLNA_API_BASE}/executions/${record.execution_id}`,
          { headers: { Authorization: `Bearer ${bolnaToken}` } }
        );
        if (execRes.ok) {
          const execData = await execRes.json().catch(() => null);
          // Bolna stores the S3 URL in telephony_data.recording_url
          recordingUrl =
            execData?.telephony_data?.recording_url ||
            execData?.recording_url ||
            null;
        }
      } catch (_) {
        // fall through to stored URL
      }
    }

    // ── Step 2: fall back to stored recording_url ──
    if (!recordingUrl) {
      recordingUrl = record.recording_url || null;
    }

    if (!recordingUrl) {
      return res.status(404).json({ success: false, message: "No recording available" });
    }

    // ── Step 3: redirect to S3 (public) or return 404 for Twilio URLs ──
    // If it's an S3 URL, just redirect — no auth needed.
    if (recordingUrl.includes("s3.") || recordingUrl.includes("amazonaws.com")) {
      return res.redirect(302, recordingUrl);
    }

    // Twilio URLs require Basic Auth (Account SID + Auth Token) which we don't store.
    // Return 404 so the frontend can gracefully show "Recording not available".
    if (recordingUrl.includes("twilio.com") || recordingUrl.includes("api.twilio")) {
      return res.status(404).json({ success: false, message: "Recording requires Twilio credentials not stored on this server" });
    }

    // For any other URL, attempt a direct stream.
    const audioRes = await fetch(recordingUrl, { headers: { Accept: "audio/*,*/*" } });
    if (!audioRes.ok) {
      return res.status(404).json({ success: false, message: "Could not fetch recording from provider" });
    }

    const contentType = audioRes.headers.get("content-type") || "audio/mpeg";
    const buffer = await audioRes.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.byteLength);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.end(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
}

module.exports = { list, get, getRecording, getByLead };

async function getByLead(req, res, next) {
  try {
    const result = await callHistoryService.getCallHistory(req.user.id, {
      lead_id: req.params.id,
      page: req.query.page || "1",
      limit: req.query.limit || "20",
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}
