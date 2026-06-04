const mongoose = require("mongoose");

const advancePaymentSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    shop_id: { type: Number, required: true, index: true },
    amount: { type: Number, required: true },
    note: { type: String, default: "" },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("AdvancePayment", advancePaymentSchema);
