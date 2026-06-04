const mongoose = require("mongoose");

const stockMovementSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    product_id: { type: Number, required: true, index: true },
    user_id: { type: Number, required: true, index: true },
    type: { type: String, enum: ["stock_in", "stock_out"], required: true },
    quantity: { type: Number, required: true },
    previous_stock: { type: Number, default: 0 },
    new_stock: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("StockMovement", stockMovementSchema);
