const { Router } = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { create, list, get, update, remove } = require("../controllers/projectController");

const router = Router();

router.post("/", requireAuth, create);
router.get("/", requireAuth, list);
router.get("/:id", requireAuth, get);
router.put("/:id", requireAuth, update);
router.delete("/:id", requireAuth, remove);

module.exports = router;
