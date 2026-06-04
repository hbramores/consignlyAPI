const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true, index: true },
    user_id: { type: Number, default: null, index: true },
    shop_id: { type: Number, default: null, index: true },
    actor_type: { type: String, default: "system" },
    action: { type: String, required: true },
    entity_type: { type: String, default: null },
    entity_id: { type: Number, default: null },
    details: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);
