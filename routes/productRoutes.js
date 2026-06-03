const express = require("express");
const router = express.Router();

const upload = require("../middleware/upload");

const {
  getProducts,
  addProduct,
  deleteProduct,
  updateProduct,
} = require("../controllers/productController");

router.get("/:user_id", getProducts);

router.post("/", upload.single("image"), addProduct);

router.delete("/:id", deleteProduct);

router.put("/:id", upload.single("image"), updateProduct);

module.exports = router;
