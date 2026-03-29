const Bull = require("bull");
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Bull queue for outbound lead calls.
 * Jobs are processed by src/workers/callWorker.js.
 */
const singleLeadCallQueue = new Bull("single-lead-call", REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: 50,   // keep last 50 completed jobs
    removeOnFail: 100,      // keep last 100 failed jobs for debugging
  },
});

module.exports = { singleLeadCallQueue };
