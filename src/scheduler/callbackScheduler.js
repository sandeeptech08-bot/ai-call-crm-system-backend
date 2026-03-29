/**
 * callbackScheduler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles scheduling of callback calls via the Bull queue.
 *
 * Rules (aloqa_client style):
 *  - Calls are only placed between WINDOW_START_HOUR and WINDOW_END_HOUR.
 *  - If a requested callback time falls outside this window, it is clamped to
 *    the next valid 10:00 AM slot automatically.
 *  - If no time is provided, the next available 10:00 AM is used.
 *  - Duplicate jobs for the same lead+time are deduplicated via Bull jobId.
 */

const { singleLeadCallQueue } = require("../lib/queue");

// ─── Window configuration ─────────────────────────────────────────────────────
const WINDOW_START_HOUR = 10; // 10:00 AM
const WINDOW_END_HOUR   = 19; // 7:00 PM  (exclusive — calls placed before this)

// ─── Timezone ─────────────────────────────────────────────────────────────────
// All callback times from Bolna extracted_data are assumed to be in IST (UTC+5:30).
// Railway/production servers run in UTC, so we must offset manually.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in ms

/**
 * Convert a local IST wall-clock Date object to UTC Date.
 * i.e. treat the Date as if it were IST and return the equivalent UTC Date.
 */
function istToUtc(d) {
  return new Date(d.getTime() - IST_OFFSET_MS);
}

/**
 * Convert a UTC Date to IST wall-clock time for window comparisons.
 */
function utcToIst(d) {
  return new Date(d.getTime() + IST_OFFSET_MS);
}

// ─── Time parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a raw callback time string received from Bolna extracted_data.
 * Handles multiple formats:
 *   • ISO 8601          "2026-03-30T14:00:00Z"
 *   • DD/MM/YYYY HH:mm  "30/03/2026 14:00"
 *   • DD/MM/YYYY H:mm AM/PM "30/03/2026 2:00 PM"
 *   • DD-MM-YYYY HH:mm  "30-03-2026 14:00"
 *   • YYYY-MM-DD HH:mm  "2026-03-30 14:00"
 *   • Any string parseable by JS Date constructor
 *
 * @param {*} raw - Raw value from extracted_data
 * @returns {Date|null}
 */
function parseCallbackTime(raw) {
  if (!raw) return null;
  const str = String(raw).trim();

  // 1. DD/MM/YYYY HH:mm or DD-MM-YYYY HH:mm (optional AM/PM) — check FIRST
  //    because these are always IST from Bolna extracted_data
  const m2 = str.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i
  );
  if (m2) {
    let [, dd, mm, yyyy, hh, min, meridiem] = m2;
    let hour = parseInt(hh, 10);
    if (meridiem) {
      if (meridiem.toUpperCase() === "PM" && hour !== 12) hour += 12;
      if (meridiem.toUpperCase() === "AM" && hour === 12) hour = 0;
    }
    // Build as UTC (no timezone suffix) then treat as IST → convert to UTC
    const localDate = new Date(
      `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${min}:00Z`
    );
    if (!isNaN(localDate.getTime())) return istToUtc(localDate);
  }

  // 2. YYYY-MM-DD HH:mm (space instead of T) — treat as IST
  const m3 = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (m3) {
    const localDate = new Date(`${m3[1]}-${m3[2]}-${m3[3]}T${m3[4]}:${m3[5]}:00Z`);
    if (!isNaN(localDate.getTime())) return istToUtc(localDate);
  }

  // 3. ISO 8601 with explicit timezone — use as-is (already has tz info)
  const native = new Date(str);
  if (!isNaN(native.getTime())) return native;

  console.warn("[callbackScheduler] Could not parse callback time:", str);
  return null;
}

// ─── Window enforcement ───────────────────────────────────────────────────────

/**
 * Given a desired callback Date, return a Date guaranteed to fall inside
 * the 10:00 AM – 7:00 PM calling window.
 *
 * @param {Date|null} requestedDate - Parsed date from Bolna (may be null)
 * @returns {Date} - Clamped, future date inside the allowed window
 */
function clampToWindow(requestedDate) {
  // Work in IST for window comparisons (window is 10AM-7PM IST)
  const baseUtc =
    requestedDate instanceof Date && !isNaN(requestedDate)
      ? new Date(requestedDate)
      : new Date();

  // Convert to IST for hour comparison
  let baseIst = utcToIst(baseUtc);
  baseIst.setSeconds(0, 0);

  const hour = baseIst.getHours();

  if (hour < WINDOW_START_HOUR) {
    // Too early in IST → set to 10:00 AM IST same day
    baseIst.setHours(WINDOW_START_HOUR, 0, 0, 0);
  } else if (hour >= WINDOW_END_HOUR) {
    // Too late in IST → set to 10:00 AM IST next day
    baseIst.setDate(baseIst.getDate() + 1);
    baseIst.setHours(WINDOW_START_HOUR, 0, 0, 0);
  }

  // Convert back to UTC for Bull delay calculation
  let base = istToUtc(baseIst);

  // If still in the past, push to next 10 AM IST
  if (base.getTime() <= Date.now()) {
    const nowIst = utcToIst(new Date());
    nowIst.setSeconds(0, 0);
    if (nowIst.getHours() < WINDOW_START_HOUR) {
      nowIst.setHours(WINDOW_START_HOUR, 0, 0, 0);
    } else {
      nowIst.setDate(nowIst.getDate() + 1);
      nowIst.setHours(WINDOW_START_HOUR, 0, 0, 0);
    }
    return istToUtc(nowIst);
  }

  return base;
}

// ─── Job scheduling ───────────────────────────────────────────────────────────

/**
 * Schedule a callback call for a lead via Bull queue.
 *
 * - Parses the raw callback time from Bolna extracted_data.
 * - Clamps it to the 10:00 AM – 7:00 PM window.
 * - Deduplicates via jobId so the same callback isn't queued twice.
 *
 * @param {string} leadId
 * @param {string} userId
 * @param {*} callbackTimeRaw - Raw call_back_time value from extracted_data (may be null/undefined)
 * @returns {Promise<Date>} - The actual scheduled Date
 */
async function scheduleCallback(leadId, userId, callbackTimeRaw) {
  const parsed = parseCallbackTime(callbackTimeRaw);
  const scheduledAt = clampToWindow(parsed);
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());

  const jobId = `callback:${leadId}:${scheduledAt.getTime()}`;

  await singleLeadCallQueue.add(
    { lead_id: String(leadId), user_id: String(userId) },
    { delay, jobId }
  );

  console.log(
    `[callbackScheduler] ✅ Scheduled lead=${leadId} at ${scheduledAt.toISOString()} ` +
    `(in ${Math.round(delay / 60000)}m) jobId=${jobId}` +
    (callbackTimeRaw ? ` [raw="${callbackTimeRaw}"]` : " [no time given → next 10 AM]")
  );

  return scheduledAt;
}

module.exports = { scheduleCallback, parseCallbackTime, clampToWindow };
