// has functions to get stock list, update stock, and get stock movements for a user

const db = require("../db");
const { logActivity } = require("../utils/activityLogger");
const { isInteger, isOptionalText } = require("../utils/validation");

exports.getStocks = (req, res) => {
  const user_id = req.query.user_id;

  const sql = `
    SELECT 
      p.id,
      p.product_name,
      p.product_code,
      p.category,
      p.minimum_stock,
      p.image,
      COALESCE(mi.quantity, 0) AS quantity
    FROM products p
    LEFT JOIN main_inventory mi ON p.id = mi.product_id
    WHERE p.status = 'active' AND p.user_id = ?
  `;

  db.query(sql, [user_id], (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
};

exports.updateStock = (req, res) => {
 const { product_id, user_id, quantity, notes } = req.body;

  if (!isInteger(quantity) || Number(quantity) === 0 || !isOptionalText(notes)) {
    return res.status(400).json({ message: "Invalid stock field format" });
  }

  const verifyProductSql = `
    SELECT id 
    FROM products 
    WHERE id = ? AND user_id = ? AND status = 'active'
  `;

  db.query(verifyProductSql, [product_id, user_id], (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const getStockSql = `
      SELECT quantity 
      FROM main_inventory 
      WHERE product_id = ?
    `;

    db.query(getStockSql, [product_id], (err, result) => {
      if (err) return res.status(500).json(err);

      const previousStock = result.length > 0 ? Number(result[0].quantity) : 0;
      const qty = Number(quantity);

      if (!quantity || qty === 0) {
        return res.status(400).json({ message: "Enter a valid quantity" });
      }

      const newStock = previousStock + qty;
      const movementType = qty > 0 ? "stock_in" : "stock_out";

      if (newStock < 0) {
        return res.status(400).json({ message: "Not enough stock" });
      }

      const upsertInventorySql = `
        INSERT INTO main_inventory (product_id, quantity)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE quantity = ?
      `;

      db.query(upsertInventorySql, [product_id, newStock, newStock], (err) => {
        if (err) return res.status(500).json(err);

        const insertMovementSql = `
          INSERT INTO stock_movements
          (product_id, user_id, type, quantity, previous_stock, new_stock, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
          insertMovementSql,
          [product_id, user_id, movementType, Math.abs(qty), previousStock, newStock, notes],
          (err) => {
            if (err) return res.status(500).json(err);

            logActivity({
              user_id,
              actor_type: "user",
              action: "updated_stock",
              entity_type: "product",
              entity_id: product_id,
              details: {
                type: movementType,
                quantity: Math.abs(qty),
                previous_stock: previousStock,
                new_stock: newStock,
                notes,
              },
            });

            res.json({ message: "Stock updated successfully" });
          }
        );
      });
    });
  });
};

exports.getStockMovements = (req, res) => {
  const user_id = req.query.user_id;

  const sql = `
    SELECT sm.*, p.product_name, p.image
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    WHERE sm.user_id = ?
    AND sm.created_at >= NOW() - INTERVAL 30 DAY
    ORDER BY sm.created_at DESC
  `;

  db.query(sql, [user_id], (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
};
