const db = require("../db");
const { ensureActivityLogTable } = require("../utils/activityLogger");

exports.getActivityLogs = async (req, res) => {
  const { user_id, shop_id, limit } = req.query;
  const filters = [];
  const values = [];

  await ensureActivityLogTable();

  if (user_id) {
    filters.push("user_id = ?");
    values.push(user_id);
  }

  if (shop_id) {
    filters.push("shop_id = ?");
    values.push(shop_id);
  }

  const maxRows = Math.min(Number(limit) || 100, 500);
  values.push(maxRows);

  const sql = `
    SELECT *
    FROM activity_logs
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT ?
  `;

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("ACTIVITY LOG FETCH ERROR:", err);
      return res.status(500).json({ message: "Failed to fetch activity logs" });
    }

    res.json(result);
  });
};
