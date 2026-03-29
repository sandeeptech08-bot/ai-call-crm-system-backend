const { Router } = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { list } = require("../controllers/phoneNumberController");

const router = Router();

router.get("/", requireAuth, list);

module.exports = router;
