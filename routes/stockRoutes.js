const express = require("express");
const router = express.Router();
const stockController = require("../controllers/stockController");

router.get("/", stockController.getStocks);
router.post("/update", stockController.updateStock);
router.get("/movements", stockController.getStockMovements);

module.exports = router;