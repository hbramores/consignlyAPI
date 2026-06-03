// has only 1 function: getDashboardSummary.

const db = require("../db");

const getDashboardSummary = (req, res) => {
  const { user_id } = req.params;

  const summary = {};

  const productQuery = `
    SELECT COUNT(*) AS totalProducts 
    FROM products 
    WHERE status = 'active' AND user_id = ?
    `;
  
  const stockQuery = `
    SELECT IFNULL(SUM(mi.quantity), 0) AS totalStocks
    FROM main_inventory mi
    JOIN products p ON mi.product_id = p.id
    WHERE p.user_id = ?
  `;

  const shopQuery = `
    SELECT COUNT(*) AS totalShops 
    FROM shops 
    WHERE status = 'active' AND user_id = ?
    `;

  const salesQuery = `
    SELECT COALESCE(SUM(s.total_amount), 0) AS total_sales
    FROM sales s
    JOIN shops sh ON s.shop_id = sh.id
    WHERE sh.user_id = ?
  `;

  const lowStockQuery = `
    SELECT COUNT(*) AS lowStockCount
    FROM products p
    LEFT JOIN main_inventory mi ON p.id = mi.product_id
    WHERE p.user_id = ?
    AND p.status = 'active'
    AND COALESCE(mi.quantity, 0) <= p.minimum_stock
  `;

  db.query(productQuery, [user_id], (err, productResult) => {
    if (err) {
      console.log("Product summary error:", err);
      return res.status(500).json({ message: "Product summary error" });
    }

    summary.products = productResult[0].totalProducts;

    db.query(stockQuery, [user_id],  (err, stockResult) => {
      if (err) {
        console.log("Stock summary error:", err);
        return res.status(500).json({ message: "Stock summary error" });
      }

      summary.stocks = stockResult[0].totalStocks || 0;

      db.query(shopQuery, [user_id], (err, shopResult) => {
        if (err) {
          console.log("Shop summary error:", err);
          return res.status(500).json({ message: "Shop summary error" });
        }

        summary.shops = shopResult[0].totalShops;

        db.query(salesQuery, [user_id], (err, salesResult) => {
          if (err) {
            console.log("Sales summary error:", err);
            return res.status(500).json({ message: "Sales summary error" });
          }

          summary.total_sales = Number(salesResult[0].total_sales) || 0;

            db.query(lowStockQuery, [user_id], (err, lowStockResult) => {
            if (err) {
                console.log("Low stock summary error:", err);
                return res.status(500).json({ message: "Low stock summary error" });
            }

            summary.lowStock = lowStockResult[0].lowStockCount;

            res.json(summary);
            });
        });
      });
    });
  });
};

module.exports = {
  getDashboardSummary,
};