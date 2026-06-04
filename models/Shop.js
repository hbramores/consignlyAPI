const mongoose = require("mongoose");

const shopSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    shop_name: { type: String, required: true },
    contact_person: { type: String, required: true },
    phone_number: { type: String, required: true },
    address: { type: String, required: true },
    commission_rate: { type: Number, default: 0 },
    contract_type: { type: String, enum: ["percentage", "manual_pricing"], default: "percentage" },
    access_code: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    user_id: { type: Number, required: true, index: true },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Shop", shopSchema);
