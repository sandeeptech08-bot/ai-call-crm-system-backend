const transport = require("nodemailer");

/**
 * Creates a reusable transporter on first use.
 * All configuration is read from environment variables.
 *
 * Required env vars:
 *   MAIL_HOST   — SMTP host (e.g. smtp.gmail.com)
 *   MAIL_PORT   — SMTP port (e.g. 465 or 587)
 *   MAIL_USER   — SMTP username / email
 *   MAIL_PASS   — SMTP password / app password
 *   MAIL_FROM   — Display name + address (e.g. "Bolna AI <you@gmail.com>")
 *   MAIL_TO     — Recipient for system notifications
 *   MAIL_SECURE — "true" for port 465, "false" for STARTTLS (default: "true")
 */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.MAIL_HOST;
  const port = parseInt(process.env.MAIL_PORT || "465", 10);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  const secure = (process.env.MAIL_SECURE ?? "true") === "true";

  if (!host || !user || !pass) return null;

  _transporter = transport.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return _transporter;
}

/**
 * Send an email. Silently no-ops if mail is not configured.
 * @param {{ to?: string, subject: string, html: string, text?: string }} options
 */
async function sendMail({ to, subject, html, text }) {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      console.warn("[mailer] Mail not configured — skipping.");
      return;
    }

    const recipient = to || process.env.MAIL_TO;
    if (!recipient) return;

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: recipient,
      subject,
      html,
      ...(text ? { text } : {}),
    });
  } catch (err) {
    // Non-critical — log but never break the request
    console.error("[mailer] Failed to send mail:", err.message);
  }
}

module.exports = { sendMail };
