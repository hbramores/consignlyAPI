const express = require("express");
const router = express.Router();

const {
  getReports,
  getReportFilters,
} = require("../controllers/reportController");

router.get("/", getReports);
router.get("/filters", getReportFilters);

module.exports = router;
