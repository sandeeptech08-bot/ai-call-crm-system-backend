const { Router } = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { create, list, get, update, remove, callLead } = require("../controllers/leadController");
const { getByLead } = require("../controllers/callHistoryController");

const router = Router();

router.post("/", requireAuth, create);
router.get("/", requireAuth, list);
router.get("/:id", requireAuth, get);
router.put("/:id", requireAuth, update);
router.delete("/:id", requireAuth, remove);
router.post("/:id/call", requireAuth, callLead);
router.get("/:id/call-history", requireAuth, getByLead);

module.exports = router;
