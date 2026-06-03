const express = require("express");
const router = express.Router();

const { 
  shopLogin, 
  createShop, 
  getShops, 
  recordAdvance,
  getAdvancePayments,
  updateShop,
  archiveShop,
  activateShop,
  getArchivedShops,
  assignInventory,
  getShopInventory,
  getShopDashboardSummary,
  recordShopSale,
  returnAllToArtisan,
  getShopSalesHistory,
  getAvailableProducts,
  updateShopSellingPrice,
  getShopProductSummary,
  getReturnedProducts,
  confirmReturn,
  rejectReturn,
} = require("../controllers/shopController");

router.post("/shop-login", shopLogin);
router.post("/create", createShop);
router.post("/advance", recordAdvance);
router.post("/assign-inventory", assignInventory);
router.patch("/:shop_id", updateShop);
router.patch("/:shop_id/archive", archiveShop);
router.patch("/:shop_id/activate", activateShop);

router.patch("/returns/:return_id/confirm", confirmReturn);
router.patch("/returns/:return_id/reject", rejectReturn);

router.get("/products-with-stock", getAvailableProducts);
router.get("/inventory/:shop_id", getShopInventory);
router.patch("/inventory/:shop_id/:product_id/price", updateShopSellingPrice);

router.get("/:shop_id/dashboard-summary", getShopDashboardSummary);
router.get("/:shop_id/sales-history", getShopSalesHistory);
router.get("/:shop_id/advance-payments", getAdvancePayments);
router.get("/:shop_id/product-summary", getShopProductSummary);
router.get("/:shop_id/returned-products", getReturnedProducts);

router.post("/:shop_id/record-sale", recordShopSale);
router.post("/:shop_id/return-all", returnAllToArtisan);

router.get("/:user_id/archived", getArchivedShops);
router.get("/:user_id", getShops);

module.exports = router;
