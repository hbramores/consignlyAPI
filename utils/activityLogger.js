const db = require("../db");

let tableReadyPromise;

const requiredColumns = {
  user_id: "INT NULL",
  shop_id: "INT NULL",
  actor_type: "VARCHAR(30) NOT NULL DEFAULT 'system'",
  action: "VARCHAR(80) NOT NULL",
  entity_type: "VARCHAR(80) NULL",
  entity_id: "INT NULL",
  details: "TEXT NULL",
  created_at: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
};

function addMissingColumns(existingColumns, resolve) {
  const missingColumns = Object.entries(requiredColumns).filter(
    ([column]) => !existingColumns.has(column)
  );

  if (missingColumns.length === 0) {
    resolve(true);
    return;
  }

  let completed = 0;

  missingColumns.forEach(([column, definition]) => {
    db.query(`ALTER TABLE activity_logs ADD COLUMN ${column} ${definition}`, (err) => {
      if (err) {
        console.error("ACTIVITY LOG ALTER ERROR:", err);
        resolve(false);
        return;
      }

      completed++;

      if (completed === missingColumns.length) {
        resolve(true);
      }
    });
  });
}

function ensureActivityLogTable() {
  if (!tableReadyPromise) {
    tableReadyPromise = new Promise((resolve) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS activity_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          shop_id INT NULL,
          actor_type VARCHAR(30) NOT NULL DEFAULT 'system',
          action VARCHAR(80) NOT NULL,
          entity_type VARCHAR(80) NULL,
          entity_id INT NULL,
          details TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      db.query(sql, (err) => {
        if (err) {
          console.error("ACTIVITY LOG TABLE ERROR:", err);
          resolve(false);
          return;
        }

        db.query("SHOW COLUMNS FROM activity_logs", (columnErr, columns) => {
          if (columnErr) {
            console.error("ACTIVITY LOG COLUMN ERROR:", columnErr);
            resolve(false);
            return;
          }

          addMissingColumns(new Set(columns.map((column) => column.Field)), resolve);
        });
      });
    });
  }

  return tableReadyPromise;
}

function logActivity({
  user_id = null,
  shop_id = null,
  actor_type = "system",
  action,
  entity_type = null,
  entity_id = null,
  details = null,
}) {
  if (!action) return;

  ensureActivityLogTable().then((ready) => {
    if (!ready) return;

    const sql = `
      INSERT INTO activity_logs
      (user_id, shop_id, actor_type, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [
        user_id,
        shop_id,
        actor_type,
        action,
        entity_type,
        entity_id,
        details ? JSON.stringify(details) : null,
      ],
      (err) => {
        if (err) {
          console.error("ACTIVITY LOG INSERT ERROR:", err);
        }
      }
    );
  });
}

module.exports = {
  ensureActivityLogTable,
  logActivity,
};
