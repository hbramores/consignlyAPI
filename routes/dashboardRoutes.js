const express = require("express");
const router = express.Router();

const { getDashboardSummary } = require("../controllers/dashboardController");

router.get("/summary/:user_id", getDashboardSummary);

module.exports = router;