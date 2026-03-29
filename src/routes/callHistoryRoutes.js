const { Router } = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { list, get, getRecording } = require("../controllers/callHistoryController");

const router = Router();

router.get("/", requireAuth, list);
router.get("/:id/recording", requireAuth, getRecording);
router.get("/:id", requireAuth, get);

module.exports = router;
