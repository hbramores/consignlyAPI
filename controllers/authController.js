
// has only 2 functions: signin and signup.

const db = require("../db");
const { USERNAME_PATTERN } = require("../utils/validation");
const {
  hashPassword,
  isHashedPassword,
  verifyPassword,
} = require("../utils/passwordHash");
const { logActivity } = require("../utils/activityLogger");

// Signin
exports.signin = (req, res) => {
  const { username, password } = req.body;

  if (!USERNAME_PATTERN.test(username || "") || typeof password !== "string" || password.length < 6 || password.length > 72) {
    return res.status(400).json({ message: "Invalid username or password format" });
  }

  const sql = "SELECT * FROM users WHERE username = ?";

  db.query(sql, [username], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Login failed" });
    }

    if (result.length === 0 || !verifyPassword(password, result[0].password)) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const user = result[0];

    if (user.status === "inactive") {
      return res.status(403).json({
        message: "This account has been deactivated.",
      });
    }

    if (user.status !== "approved") {
      return res.status(403).json({
        message: "Your account is still pending admin approval.",
      });
    }

    if (!isHashedPassword(user.password)) {
      db.query(
        "UPDATE users SET password = ? WHERE id = ?",
        [hashPassword(password), user.id],
        (updateErr) => {
          if (updateErr) {
            console.error("PASSWORD UPGRADE ERROR:", updateErr);
          }
        }
      );
    }

    logActivity({
      user_id: user.id,
      actor_type: user.role,
      action: "signed_in",
      entity_type: "user",
      entity_id: user.id,
      details: { username: user.username },
    });

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  });
};

// signup
exports.signup = (req, res) => {
  const { username, password, role } = req.body;

  if (!USERNAME_PATTERN.test(username || "")) {
    return res.status(400).json({ message: "Username must use only letters, numbers, or underscores" });
  }

  if (typeof password !== "string" || password.length < 6 || password.length > 72) {
    return res.status(400).json({ message: "Password must be 6-72 characters" });
  }

  if (role && !["user", "admin"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  const sql =
    "INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, ?)";
  const normalizedRole = role || "user";
  const initialStatus = normalizedRole === "admin" ? "approved" : "pending";
  const values = [username, hashPassword(password), normalizedRole, initialStatus];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Signup failed" });
    }

    logActivity({
      user_id: result.insertId,
      actor_type: normalizedRole,
      action: "created_account",
      entity_type: "user",
      entity_id: result.insertId,
      details: { username, role: normalizedRole, status: initialStatus },
    });

    res.json({ success: true, message: "User registered successfully" });
  });
};
