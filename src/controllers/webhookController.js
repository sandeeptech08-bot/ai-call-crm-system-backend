const webhookService = require("../services/webhookService");

/**
 * POST /api/webhooks/bolna
 * Respond 200 immediately so Bolna doesn't retry, then process async.
 */
async function bolna(req, res) {
  res.status(200).json({ success: true });

  webhookService.processWebhook(req.body).catch((err) => {
    console.error("[webhook] Processing error:", err.message);
  });
}

module.exports = { bolna };
