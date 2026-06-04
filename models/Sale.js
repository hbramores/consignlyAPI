const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    shop_id: { type: Number, required: true, index: true },
    product_id: { type: Number, required: true, index: true },
    quantity: { type: Number, required: true },
    total_amount: { type: Number, required: true },
    selling_price: { type: Number, required: true },
    artisan_price: { type: Number, default: 0 },
    commission_amount: { type: Number, default: 0 },
    artisan_earnings: { type: Number, default: 0 },
    contract_type: { type: String, default: "percentage" },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Sale", saleSchema);
