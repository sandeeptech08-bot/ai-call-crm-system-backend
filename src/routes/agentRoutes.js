const { Router } = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { create, list, get, update, updateWebhook, remove, voices } = require("../controllers/agentController");

const router = Router();

router.post("/", requireAuth, create);
router.get("/", requireAuth, list);
router.get("/voices", requireAuth, voices);
router.get("/:id", requireAuth, get);
router.put("/:id", requireAuth, update);
router.put("/:id/webhook", requireAuth, updateWebhook);
router.delete("/:id", requireAuth, remove);

module.exports = router;
