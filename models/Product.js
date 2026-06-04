const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    product_code: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    product_name: { type: String, required: true },
    description: { type: String, default: "" },
    image: { type: String, default: null },
    base_price: { type: Number, required: true },
    minimum_stock: { type: Number, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    user_id: { type: Number, required: true, index: true },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Product", productSchema);
