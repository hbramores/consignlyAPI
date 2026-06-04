const mongoose = require("mongoose");

const mainInventorySchema = new mongoose.Schema(
  {
    product_id: { type: Number, required: true, unique: true, index: true },
    quantity: { type: Number, default: 0 },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("MainInventory", mainInventorySchema);
