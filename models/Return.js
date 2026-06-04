const mongoose = require("mongoose");

const returnSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    shop_id: { type: Number, required: true, index: true },
    product_id: { type: Number, required: true, index: true },
    quantity: { type: Number, required: true },
    reason: { type: String, default: "" },
    status: { type: String, enum: ["pending", "confirmed", "rejected"], default: "pending" },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Return", returnSchema);
