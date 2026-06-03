// has functions to get user list, deactivate user, and approve user

const db = require("../db");
const { logActivity } = require("../utils/activityLogger");

exports.getUsers = (req, res) => {
  const sql = "SELECT id, username, role, status, created_at FROM users ORDER BY created_at DESC";

  db.query(sql, (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to fetch users" });
    }

    res.json(result);
  });
};

exports.deactivateUser = (req, res) => {
  const { id } = req.params;

  const sql = "UPDATE users SET status = 'inactive' WHERE id = ? AND role != 'admin'";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to deactivate user" });
    }

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "Cannot deactivate admin user" });
    }

    logActivity({
      actor_type: "admin",
      action: "deactivated_user",
      entity_type: "user",
      entity_id: id,
    });

    res.json({ message: "User deactivated successfully" });
  });
};

exports.approveUser = (req, res) => {
  const { id } = req.params;

  const sql =
    "UPDATE users SET status = 'approved' WHERE id = ? AND role != 'admin'";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to approve user" });
    }

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "Cannot approve this user" });
    }

    logActivity({
      actor_type: "admin",
      action: "approved_user",
      entity_type: "user",
      entity_id: id,
    });

    res.json({ message: "User approved successfully" });
  });
};
