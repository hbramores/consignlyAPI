// has functions recordShopSale, returnAllToArtisan, getShopSalesHistory, getReturnedProducts, confirmReturn, and rejectReturn for handling shop transactions
//shopTransactionController.js
const db = require("../../db");
const { logActivity } = require("../../utils/activityLogger");
const { isInteger, isOptionalText } = require("../../utils/validation");

// Record Shop Sale
exports.recordShopSale = (req, res) => {
  const { shop_id } = req.params;
  const { product_id, type, quantity, reason } = req.body;

  if (
    !product_id ||
    !["sold", "returned"].includes(type) ||
    !isInteger(quantity) ||
    Number(quantity) <= 0 ||
    !isOptionalText(reason)
  ) {
    return res.status(400).json({ message: "Invalid transaction data" });
  }

  const qty = Number(quantity);

  const checkSql = `
   SELECT 
      SUM(si.quantity) AS available_quantity,
      p.product_name,
      si.shop_selling_price,
      si.artisan_price,
      p.base_price,
      s.contract_type,
      s.commission_rate
    FROM shop_inventory si
    JOIN products p ON si.product_id = p.id
    JOIN shops s ON si.shop_id = s.id
    WHERE si.shop_id = ? AND si.product_id = ?
    GROUP BY 
      si.product_id,
      p.product_name,
      si.shop_selling_price,
      si.artisan_price,
      p.base_price,
      s.contract_type,
      s.commission_rate
  `;

  db.query(checkSql, [shop_id, product_id], (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.length === 0) {
      return res.status(404).json({ message: "Product not in shop inventory" });
    }

    const availableQty = Number(result[0].available_quantity);
    const contractType = result[0].contract_type;
    const commissionRate = Number(result[0].commission_rate || 0);

    const shopSellingPrice = Number(result[0].shop_selling_price);
    const artisanPrice = Number(result[0].artisan_price || result[0].base_price);
    const productName = result[0].product_name;

    if (qty > availableQty) {
      return res.status(400).json({ message: "Not enough stock available" });
    }

    if (type === "sold") {
      let sellingPrice;
      let commission;
      let artisanEarnings;

      if (contractType === "percentage") {
        sellingPrice = artisanPrice * (1 + commissionRate / 100);
        commission = sellingPrice * (commissionRate / 100);
        artisanEarnings = sellingPrice - commission;
      } else {
        sellingPrice = shopSellingPrice;
        commission = sellingPrice - artisanPrice;
        artisanEarnings = artisanPrice;
      }

      const totalAmount = sellingPrice * qty;

      db.query(
        `INSERT INTO sales 
        (shop_id, product_id, quantity, total_amount, selling_price, artisan_price, commission_amount, artisan_earnings, contract_type) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shop_id,
          product_id,
          qty,
          totalAmount,
          sellingPrice,
          artisanPrice,
          commission,
          artisanEarnings,
          contractType,
        ],
        (err) => {
          if (err) return res.status(500).json({ message: "Failed to record sale" });

          db.query(
            "UPDATE shop_inventory SET quantity = quantity - ? WHERE shop_id = ? AND product_id = ?",
            [qty, shop_id, product_id],
            (err) => {
              if (err) return res.status(500).json({ message: "Failed to update inventory" });

              logActivity({
                shop_id,
                actor_type: "shop_owner",
                action: "recorded_sale",
                entity_type: "product",
                entity_id: product_id,
                details: {
                  product_name: productName,
                  quantity: qty,
                  total_amount: totalAmount,
                  selling_price: sellingPrice,
                },
              });

              res.json({
                success: true,
                message: "Sale recorded successfully",
                transaction: { product_name: productName, type, quantity: qty },
              });
            }
          );
        }
      );
    }

    if (type === "returned") {
      db.query(
        "INSERT INTO returns (shop_id, product_id, quantity, reason, status) VALUES (?, ?, ?, ?, 'pending')",
        [shop_id, product_id, qty, reason],
        (err) => {
          if (err) {
            return res.status(500).json({ message: "Failed to submit return request" });
          }

          db.query(
            "UPDATE shop_inventory SET quantity = quantity - ? WHERE shop_id = ? AND product_id = ?",
            [qty, shop_id, product_id],
            (err) => {
              if (err) {
                return res.status(500).json({ message: "Failed to update shop inventory" });
              }

              logActivity({
                shop_id,
                actor_type: "shop_owner",
                action: "submitted_return",
                entity_type: "product",
                entity_id: product_id,
                details: { product_name: productName, quantity: qty, reason },
              });

              res.json({
                success: true,
                message: "Return request submitted successfully",
                transaction: { product_name: productName, type, quantity: qty },
              });
            }
          );
        }
      );
    }
  });
};

// Return All Products to Artisan
exports.returnAllToArtisan = (req, res) => {
  const { shop_id } = req.params;

  db.query(
    "SELECT product_id, quantity FROM shop_inventory WHERE shop_id = ? AND quantity > 0",
    [shop_id],
    (err, inventory) => {
      if (err) return res.status(500).json(err);

      if (inventory.length === 0) {
        return res.status(400).json({ message: "No products to return" });
      }

      let completed = 0;

      inventory.forEach((item) => {
        const qty = Number(item.quantity);
        const pid = item.product_id;

        db.query(
          "INSERT INTO returns (shop_id, product_id, quantity) VALUES (?, ?, ?)",
          [shop_id, pid, qty],
          (err) => {
            if (err) return res.status(500).json({ message: "Failed to record return" });

            db.query(
              "UPDATE shop_inventory SET quantity = 0 WHERE shop_id = ? AND product_id = ?",
              [shop_id, pid],
              (err) => {
                if (err) return res.status(500).json({ message: "Failed to update shop inventory" });

                db.query(
                  "UPDATE main_inventory SET quantity = quantity + ? WHERE product_id = ?",
                  [qty, pid],
                  (err) => {
                    if (err) return res.status(500).json({ message: "Failed to update main inventory" });

                    completed++;

                    if (completed === inventory.length) {
                      logActivity({
                        shop_id,
                        actor_type: "shop_owner",
                        action: "returned_all_to_artisan",
                        entity_type: "shop_inventory",
                        entity_id: shop_id,
                        details: { product_count: inventory.length },
                      });

                      res.json({
                        success: true,
                        message: `All ${inventory.length} product(s) returned to artisan successfully`,
                      });
                    }
                  }
                );
              }
            );
          }
        );
      });
    }
  );
};

// Get Shop Sales History
exports.getShopSalesHistory = (req, res) => {
  const { shop_id } = req.params;
  const limit = Number(req.query.limit) || 10;

  const sql = `
    SELECT 
      s.id,
      s.quantity,
      s.total_amount,
      s.created_at,
      p.product_name,
      s.selling_price,
      s.selling_price AS price,
      s.artisan_earnings,
      s.commission_amount

    FROM sales s
    JOIN products p ON s.product_id = p.id

    WHERE s.shop_id = ?

    ORDER BY s.created_at DESC
    LIMIT ?
  `;

  db.query(sql, [shop_id, limit], (err, result) => {
    if (err) {
      console.error("Sales history error:", err);
      return res.status(500).json({ message: "Failed to fetch sales history" });
    }

    res.json(result);
  });
};

exports.getReturnedProducts = (req, res) => {
  const { shop_id } = req.params;
  const limit = Number(req.query.limit) || 10;

  const sql = `
    SELECT 
      r.id,
      r.quantity,
      r.reason,
      r.status,
      r.created_at,
      p.product_name
    FROM returns r
    JOIN products p ON r.product_id = p.id
    WHERE r.shop_id = ?
    ORDER BY r.created_at DESC
    LIMIT ?
  `;

  db.query(sql, [shop_id, limit], (err, result) => {
    if (err) {
      console.error("Returned products error:", err);
      return res.status(500).json({ message: "Failed to fetch returned products" });
    }

    res.json(result);
  });
};

// Confirm Return
exports.confirmReturn = (req, res) => {
  const { return_id } = req.params;

  const getReturnSql = `
    SELECT
      r.*,
      sh.shop_name,
      p.user_id
    FROM returns r
    JOIN shops sh ON r.shop_id = sh.id
    JOIN products p ON r.product_id = p.id
    WHERE r.id = ? AND r.status = 'pending'
  `;

  db.query(getReturnSql, [return_id], (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.length === 0) {
      return res.status(404).json({ message: "Return request not found" });
    }

    const returnData = result[0];

    db.query("SELECT quantity FROM main_inventory WHERE product_id = ?", [returnData.product_id], (err, stockResult) => {
      if (err) return res.status(500).json(err);

      const previousStock = stockResult.length > 0 ? Number(stockResult[0].quantity) : 0;
      const returnQty = Number(returnData.quantity);
      const newStock = previousStock + returnQty;

      db.query(
        "UPDATE returns SET status = 'confirmed' WHERE id = ?",
        [return_id],
        (err) => {
          if (err) {
            return res.status(500).json({ message: "Failed to confirm return" });
          }

          const upsertInventorySql = `
            INSERT INTO main_inventory (product_id, quantity)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE quantity = ?
          `;

          db.query(upsertInventorySql, [returnData.product_id, newStock, newStock], (err) => {
            if (err) {
              return res.status(500).json({ message: "Failed to update main inventory" });
            }

            const insertMovementSql = `
              INSERT INTO stock_movements
              (product_id, user_id, type, quantity, previous_stock, new_stock, notes)
              VALUES (?, ?, 'stock_in', ?, ?, ?, ?)
            `;

            db.query(
              insertMovementSql,
              [
                returnData.product_id,
                returnData.user_id,
                returnQty,
                previousStock,
                newStock,
                `Returned from ${returnData.shop_name}`,
              ],
              (err) => {
                if (err) {
                  return res.status(500).json({ message: "Failed to record stock movement" });
                }

                logActivity({
                  user_id: returnData.user_id,
                  shop_id: returnData.shop_id,
                  actor_type: "user",
                  action: "confirmed_return",
                  entity_type: "return",
                  entity_id: return_id,
                  details: {
                    product_id: returnData.product_id,
                    quantity: returnQty,
                    new_stock: newStock,
                  },
                });

                res.json({
                  success: true,
                  message: "Return confirmed successfully",
                });
              }
            );
          });
        }
      );
    });
  });
};

// Reject Return
exports.rejectReturn = (req, res) => {
  const { return_id } = req.params;

  const getReturnSql = `
    SELECT * FROM returns
    WHERE id = ? AND status = 'pending'
  `;

  db.query(getReturnSql, [return_id], (err, result) => {
    if (err) return res.status(500).json(err);

    if (result.length === 0) {
      return res.status(404).json({ message: "Return request not found" });
    }

    const returnData = result[0];

    db.query(
      "UPDATE returns SET status = 'rejected' WHERE id = ?",
      [return_id],
      (err) => {
        if (err) {
          return res.status(500).json({ message: "Failed to reject return" });
        }

        db.query(
          "UPDATE shop_inventory SET quantity = quantity + ? WHERE shop_id = ? AND product_id = ?",
          [returnData.quantity, returnData.shop_id, returnData.product_id],
          (err) => {
            if (err) {
              return res.status(500).json({ message: "Failed to restore shop inventory" });
            }

            logActivity({
              shop_id: returnData.shop_id,
              actor_type: "user",
              action: "rejected_return",
              entity_type: "return",
              entity_id: return_id,
              details: {
                product_id: returnData.product_id,
                quantity: returnData.quantity,
              },
            });

            res.json({
              success: true,
              message: "Return rejected and inventory restored",
            });
          }
        );
      }
    );
  });
};
