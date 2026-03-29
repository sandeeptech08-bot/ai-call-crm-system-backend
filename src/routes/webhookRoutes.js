const { Router } = require("express");
const { bolna } = require("../controllers/webhookController");

const router = Router();

router.post("/bolna", bolna);

module.exports = router;
