// has functions getShopDashboardSummary and getShopProductSummary for shop dashboard data
// shopDashboardController.js
const db = require("../../db");

// Get Shop Dashboard Summary
exports.getShopDashboardSummary = (req, res) => {
  const { shop_id } = req.params;
  const summary = {};

  const salesQuery = `
    SELECT 
      COALESCE(SUM(total_amount), 0) AS total_sales,
      COALESCE(SUM(commission_amount * quantity), 0) AS total_commission,
      COALESCE(SUM(quantity), 0) AS total_sold_items
    FROM sales
    WHERE shop_id = ?
  `;

  db.query(salesQuery, [shop_id], (err, salesResult) => {
    if (err) {
      console.error("Sales summary error:", err);
      return res.status(500).json({ message: "Sales summary error" });
    }

    summary.total_sales = Number(salesResult[0].total_sales) || 0;
    summary.total_commission = Number(salesResult[0].total_commission) || 0;
    summary.total_sold_items = Number(salesResult[0].total_sold_items) || 0;

    const advanceQuery = `
      SELECT COALESCE(SUM(amount), 0) AS total_advance
      FROM advance_payments
      WHERE shop_id = ?
    `;

    db.query(advanceQuery, [shop_id], (err, advanceResult) => {
      if (err) {
        console.error("Advance summary error:", err);
        return res.status(500).json({ message: "Advance summary error" });
      }

      summary.total_advance = Number(advanceResult[0].total_advance) || 0;
      const pendingReturnQuery = `
        SELECT COALESCE(SUM(quantity), 0) AS pending_returns
        FROM returns
        WHERE shop_id = ? AND status = 'pending'
      `;

      db.query(pendingReturnQuery, [shop_id], (err, returnResult) => {
        if (err) {
          console.error("Pending returns error:", err);
          return res.status(500).json({ message: "Pending returns error" });
        }

        summary.pending_returns = Number(returnResult[0].pending_returns) || 0;

        summary.remaining_balance =
          summary.total_sales -
          summary.total_commission -
          summary.total_advance;

        res.json(summary);
      });
    });
  });
};

// Get Shop Product Summary Table
exports.getShopProductSummary = (req, res) => {
  const { shop_id } = req.params;

  const sql = `
    SELECT 
      p.id AS product_id,
      p.product_name,
      p.image,

      COALESCE(si.remaining, 0) AS remaining,

      COALESCE(ss.sold, 0) AS sold,

      COALESCE(rr.returned, 0) AS returned,

      COALESCE(si.remaining, 0) + COALESCE(ss.sold, 0) + COALESCE(rr.returned, 0) AS assigned,

      COALESCE(ss.total_sales, 0) AS total_sales

    FROM products p

    LEFT JOIN (
      SELECT product_id, SUM(quantity) AS remaining
      FROM shop_inventory
      WHERE shop_id = ?
      GROUP BY product_id
    ) si ON p.id = si.product_id

    LEFT JOIN (
      SELECT product_id, SUM(quantity) AS sold, SUM(total_amount) AS total_sales
      FROM sales
      WHERE shop_id = ?
      GROUP BY product_id
    ) ss ON p.id = ss.product_id

    LEFT JOIN (
      SELECT product_id, SUM(quantity) AS returned
      FROM returns
      WHERE shop_id = ? AND (status IS NULL OR status != 'rejected')
      GROUP BY product_id
    ) rr ON p.id = rr.product_id

    WHERE si.product_id IS NOT NULL
      OR ss.product_id IS NOT NULL
      OR rr.product_id IS NOT NULL

    ORDER BY p.product_name ASC
  `;

  db.query(sql, [shop_id, shop_id, shop_id], (err, result) => {
    if (err) {
      console.error("Product summary error:", err);
      return res.status(500).json({ message: "Product summary error" });
    }

    res.json(result);
  });
};
