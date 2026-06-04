const mongoose = require("mongoose");

const shopInventorySchema = new mongoose.Schema(
  {
    shop_id: { type: Number, required: true, index: true },
    product_id: { type: Number, required: true, index: true },
    quantity: { type: Number, default: 0 },
    user_id: { type: Number, required: true, index: true },
    shop_selling_price: { type: Number, default: 0 },
    artisan_price: { type: Number, default: 0 },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

shopInventorySchema.index({ shop_id: 1, product_id: 1 }, { unique: true });

module.exports = mongoose.model("ShopInventory", shopInventorySchema);
