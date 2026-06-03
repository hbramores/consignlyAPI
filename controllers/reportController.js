// has only 5 functions: getDateRange, formatDateTime, addCommonFilters, getReportFilters and getReports.

const db = require("../db");

const emptyReport = {
  summary: {
    totalSales: 0,
    totalArtisanEarnings: 0,
    totalShopEarnings: 0,
    productsSold: 0,
    totalReturnsQuantity: 0,
    totalReturnsValue: 0,
    totalAdvancePayments: 0,
  },
  salesOverTime: [],
  earningsComparison: [],
  topCategories: [],
  topProducts: [],
  topShops: [],
  lowStock: [],
  returnsReport: [],
  advancePayments: [],
  inventoryMovement: [],
  profitability: [],
  shopSettlement: [],
};

function getDateRange(query) {
  const now = new Date();
  const end = new Date(now);
  let start = null;

  if (query.date_range === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (query.date_range === "week") {
    start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (query.date_range === "month" || !query.date_range) {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (query.date_range === "custom" && query.start_date && query.end_date) {
    start = new Date(query.start_date);
    end.setTime(new Date(query.end_date).getTime());
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  if (!start) return null;

  return {
    start: formatDateTime(start),
    end: formatDateTime(end),
  };
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(":");
}

function addCommonFilters(parts, params, query, alias, dateField) {
  const range = getDateRange(query);

  if (range) {
    parts.push(`${alias}.${dateField} BETWEEN ? AND ?`);
    params.push(range.start, range.end);
  }

  if (query.shop_id && query.shop_id !== "all") {
    parts.push(`${alias}.shop_id = ?`);
    params.push(query.shop_id);
  }

  if (query.product_id && query.product_id !== "all") {
    parts.push(`${alias}.product_id = ?`);
    params.push(query.product_id);
  }
}

async function runQuery(sql, params = []) {
  const [rows] = await db.promise().query(sql, params);
  return rows;
}

exports.getReportFilters = async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ message: "user_id is required" });
  }

  try {
    const [shops, products] = await Promise.all([
      runQuery(
        `SELECT id, shop_name FROM shops WHERE user_id = ? AND status = 'active' ORDER BY shop_name ASC`,
        [user_id]
      ),
      runQuery(
        `SELECT id, product_name, product_code FROM products WHERE user_id = ? AND status = 'active' ORDER BY product_name ASC`,
        [user_id]
      ),
    ]);

    res.json({ shops, products });
  } catch (err) {
    console.error("Report filters error:", err);
    res.status(500).json({ message: "Failed to fetch report filters" });
  }
};

exports.getReports = async (req, res) => {
  const { user_id, transaction_type } = req.query;

  if (!user_id) {
    return res.status(400).json({ message: "user_id is required" });
  }

  const includeSales = !transaction_type || transaction_type === "all" || transaction_type === "sales";
  const includeReturns = !transaction_type || transaction_type === "all" || transaction_type === "returns";
  const includeAdvances = !transaction_type || transaction_type === "all" || transaction_type === "advances";

  try {
    const salesWhere = ["sh.user_id = ?"];
    const salesParams = [user_id];
    addCommonFilters(salesWhere, salesParams, req.query, "s", "created_at");

    const returnsWhere = ["sh.user_id = ?"];
    const returnsParams = [user_id];
    addCommonFilters(returnsWhere, returnsParams, req.query, "r", "created_at");

    const advanceWhere = ["sh.user_id = ?"];
    const advanceParams = [user_id];
    const advanceRange = getDateRange(req.query);
    if (advanceRange) {
      advanceWhere.push("ap.created_at BETWEEN ? AND ?");
      advanceParams.push(advanceRange.start, advanceRange.end);
    }
    if (req.query.shop_id && req.query.shop_id !== "all") {
      advanceWhere.push("ap.shop_id = ?");
      advanceParams.push(req.query.shop_id);
    }

    const salesWhereSql = salesWhere.join(" AND ");
    const returnsWhereSql = returnsWhere.join(" AND ");
    const advanceWhereSql = advanceWhere.join(" AND ");

    const report = { ...emptyReport };

    const salesSummaryPromise = includeSales
      ? runQuery(
          `SELECT
             COALESCE(SUM(s.total_amount), 0) AS totalSales,
             COALESCE(SUM(s.artisan_earnings * s.quantity), 0) AS totalArtisanEarnings,
             COALESCE(SUM(s.commission_amount * s.quantity), 0) AS totalShopEarnings,
             COALESCE(SUM(s.quantity), 0) AS productsSold
           FROM sales s
           JOIN shops sh ON s.shop_id = sh.id
           WHERE ${salesWhereSql}`,
          salesParams
        )
      : Promise.resolve([{}]);

    const returnsSummaryPromise = includeReturns
      ? runQuery(
          `SELECT
             COALESCE(SUM(r.quantity), 0) AS totalReturnsQuantity,
             COALESCE(SUM(r.quantity * COALESCE(si.artisan_price, p.base_price, 0)), 0) AS totalReturnsValue
           FROM returns r
           JOIN shops sh ON r.shop_id = sh.id
           JOIN products p ON r.product_id = p.id
           LEFT JOIN shop_inventory si ON r.shop_id = si.shop_id AND r.product_id = si.product_id
           WHERE ${returnsWhereSql}`,
          returnsParams
        )
      : Promise.resolve([{}]);

    const advancesSummaryPromise = includeAdvances
      ? runQuery(
          `SELECT COALESCE(SUM(ap.amount), 0) AS totalAdvancePayments
           FROM advance_payments ap
           JOIN shops sh ON ap.shop_id = sh.id
           WHERE ${advanceWhereSql}`,
          advanceParams
        )
      : Promise.resolve([{}]);

    const [
      salesSummaryRows,
      returnsSummaryRows,
      advancesSummaryRows,
      salesOverTime,
      earningsComparison,
      topCategories,
      topProducts,
      topShops,
      lowStock,
      returnsReport,
      advancePayments,
      inventoryMovement,
      profitability,
      shopSettlement,
    ] = await Promise.all([
      salesSummaryPromise,
      returnsSummaryPromise,
      advancesSummaryPromise,
      includeSales
        ? runQuery(
            `SELECT
               DATE(s.created_at) AS period,
               COALESCE(SUM(s.total_amount), 0) AS sales
             FROM sales s
             JOIN shops sh ON s.shop_id = sh.id
             WHERE ${salesWhereSql}
             GROUP BY DATE(s.created_at)
             ORDER BY period ASC`,
            salesParams
          )
        : Promise.resolve([]),
      includeSales
        ? runQuery(
            `SELECT
               'Artisan Earnings' AS name,
               COALESCE(SUM(s.artisan_earnings * s.quantity), 0) AS value
             FROM sales s
             JOIN shops sh ON s.shop_id = sh.id
             WHERE ${salesWhereSql}
             UNION ALL
             SELECT
               'Shop Earnings' AS name,
               COALESCE(SUM(s.commission_amount * s.quantity), 0) AS value
             FROM sales s
             JOIN shops sh ON s.shop_id = sh.id
             WHERE ${salesWhereSql}`,
            [...salesParams, ...salesParams]
          )
        : Promise.resolve([]),
      includeSales
        ? runQuery(
            `SELECT
               COALESCE(p.category, 'Uncategorized') AS name,
               COALESCE(SUM(s.quantity), 0) AS value
             FROM sales s
             JOIN shops sh ON s.shop_id = sh.id
             JOIN products p ON s.product_id = p.id
             WHERE ${salesWhereSql}
             GROUP BY p.category
             ORDER BY value DESC`,
            salesParams
          )
        : Promise.resolve([]),
      includeSales
        ? runQuery(
            `SELECT
               p.product_name,
               p.product_code,
               COALESCE(SUM(s.quantity), 0) AS total_sold,
               COALESCE(SUM(s.total_amount), 0) AS revenue,
               COALESCE(SUM(s.artisan_earnings * s.quantity), 0) AS artisan_earnings,
               COALESCE(SUM(s.commission_amount * s.quantity), 0) AS shop_earnings
             FROM sales s
             JOIN shops sh ON s.shop_id = sh.id
             JOIN products p ON s.product_id = p.id
             WHERE ${salesWhereSql}
             GROUP BY p.id, p.product_name, p.product_code
             ORDER BY total_sold DESC, revenue DESC
             LIMIT 10`,
            salesParams
          )
        : Promise.resolve([]),
      includeSales
        ? runQuery(
            `SELECT
               sh.shop_name,
               COALESCE(SUM(s.total_amount), 0) AS total_sales,
               COALESCE(SUM(s.quantity), 0) AS products_sold,
               COALESCE(SUM(s.artisan_earnings * s.quantity), 0) AS artisan_earnings,
               COALESCE(SUM(s.commission_amount * s.quantity), 0) AS shop_earnings
             FROM sales s
             JOIN shops sh ON s.shop_id = sh.id
             WHERE ${salesWhereSql}
             GROUP BY sh.id, sh.shop_name
             ORDER BY total_sales DESC
             LIMIT 10`,
            salesParams
          )
        : Promise.resolve([]),
      runQuery(
        `SELECT
           p.product_name,
           COALESCE(mi.quantity, 0) AS current_stock,
           COALESCE(p.minimum_stock, 0) AS minimum_stock,
           CASE
             WHEN COALESCE(mi.quantity, 0) <= 0 THEN 'Critical'
             WHEN COALESCE(mi.quantity, 0) <= COALESCE(p.minimum_stock, 0) THEN 'Low'
             ELSE 'Safe'
           END AS status
         FROM products p
         LEFT JOIN main_inventory mi ON p.id = mi.product_id
         WHERE p.user_id = ? AND p.status = 'active'
         ORDER BY
           CASE
             WHEN COALESCE(mi.quantity, 0) <= 0 THEN 1
             WHEN COALESCE(mi.quantity, 0) <= COALESCE(p.minimum_stock, 0) THEN 2
             ELSE 3
           END,
           p.product_name ASC`,
        [user_id]
      ),
      includeReturns
        ? runQuery(
            `SELECT
               r.created_at,
               p.product_name,
               sh.shop_name,
               r.quantity,
               r.reason,
               r.status
             FROM returns r
             JOIN shops sh ON r.shop_id = sh.id
             JOIN products p ON r.product_id = p.id
             WHERE ${returnsWhereSql}
             ORDER BY r.created_at DESC
             LIMIT 50`,
            returnsParams
          )
        : Promise.resolve([]),
      includeAdvances
        ? runQuery(
            `SELECT
               sh.shop_name,
               ap.amount,
               ap.note,
               ap.created_at
             FROM advance_payments ap
             JOIN shops sh ON ap.shop_id = sh.id
             WHERE ${advanceWhereSql}
             ORDER BY ap.created_at DESC
             LIMIT 50`,
            advanceParams
          )
        : Promise.resolve([]),
      runQuery(
        `SELECT
           p.product_name,
           COALESCE(mi.quantity, 0) + COALESCE(assigned.assigned, 0) AS initial_quantity,
           COALESCE(assigned.assigned, 0) AS assigned,
           COALESCE(sold.sold, 0) AS sold,
           COALESCE(returned.returned, 0) AS returned,
           0 AS damaged,
           COALESCE(mi.quantity, 0) + COALESCE(shop_remaining.remaining, 0) AS remaining
         FROM products p
         LEFT JOIN main_inventory mi ON p.id = mi.product_id
         LEFT JOIN (
           SELECT si.product_id, SUM(si.quantity) + COALESCE(SUM(sold_by_product.sold), 0) + COALESCE(SUM(returned_by_product.returned), 0) AS assigned
           FROM shop_inventory si
           LEFT JOIN (
             SELECT shop_id, product_id, SUM(quantity) AS sold
             FROM sales
             GROUP BY shop_id, product_id
           ) sold_by_product ON si.shop_id = sold_by_product.shop_id AND si.product_id = sold_by_product.product_id
           LEFT JOIN (
             SELECT shop_id, product_id, SUM(quantity) AS returned
             FROM returns
             GROUP BY shop_id, product_id
           ) returned_by_product ON si.shop_id = returned_by_product.shop_id AND si.product_id = returned_by_product.product_id
           GROUP BY si.product_id
         ) assigned ON p.id = assigned.product_id
         LEFT JOIN (
           SELECT product_id, SUM(quantity) AS sold
           FROM sales
           GROUP BY product_id
         ) sold ON p.id = sold.product_id
         LEFT JOIN (
           SELECT product_id, SUM(quantity) AS returned
           FROM returns
           WHERE status = 'confirmed'
           GROUP BY product_id
         ) returned ON p.id = returned.product_id
         LEFT JOIN (
           SELECT product_id, SUM(quantity) AS remaining
           FROM shop_inventory
           GROUP BY product_id
         ) shop_remaining ON p.id = shop_remaining.product_id
         WHERE p.user_id = ? AND p.status = 'active'
         ORDER BY p.product_name ASC`,
        [user_id]
      ),
      includeSales
        ? runQuery(
            `SELECT
               p.product_name,
               COALESCE(SUM(s.total_amount), 0) AS revenue,
               COALESCE(SUM(s.artisan_earnings * s.quantity), 0) AS artisan_profit,
               COALESCE(SUM(s.commission_amount * s.quantity), 0) AS shop_profit,
               COALESCE(SUM(s.artisan_earnings * s.quantity), 0) + COALESCE(SUM(s.commission_amount * s.quantity), 0) AS net_earnings
             FROM sales s
             JOIN shops sh ON s.shop_id = sh.id
             JOIN products p ON s.product_id = p.id
             WHERE ${salesWhereSql}
             GROUP BY p.id, p.product_name
             ORDER BY net_earnings DESC
             LIMIT 20`,
            salesParams
          )
        : Promise.resolve([]),
      runQuery(
        `SELECT
           sh.shop_name,
           COALESCE(sales_data.total_sales, 0) AS total_sales,
           COALESCE(sales_data.shop_earnings, 0) AS shop_earnings,
           COALESCE(advance_data.advance_payments, 0) AS advance_payments,
           COALESCE(sales_data.total_sales, 0) - COALESCE(sales_data.shop_earnings, 0) - COALESCE(advance_data.advance_payments, 0) AS remaining_balance
         FROM shops sh
         LEFT JOIN (
           SELECT s.shop_id, SUM(s.total_amount) AS total_sales, SUM(s.commission_amount * s.quantity) AS shop_earnings
           FROM sales s
           GROUP BY s.shop_id
         ) sales_data ON sh.id = sales_data.shop_id
         LEFT JOIN (
           SELECT shop_id, SUM(amount) AS advance_payments
           FROM advance_payments
           GROUP BY shop_id
         ) advance_data ON sh.id = advance_data.shop_id
         WHERE sh.user_id = ? AND sh.status = 'active'
         ORDER BY total_sales DESC`,
        [user_id]
      ),
    ]);

    report.summary = {
      totalSales: Number(salesSummaryRows[0].totalSales || 0),
      totalArtisanEarnings: Number(salesSummaryRows[0].totalArtisanEarnings || 0),
      totalShopEarnings: Number(salesSummaryRows[0].totalShopEarnings || 0),
      productsSold: Number(salesSummaryRows[0].productsSold || 0),
      totalReturnsQuantity: Number(returnsSummaryRows[0].totalReturnsQuantity || 0),
      totalReturnsValue: Number(returnsSummaryRows[0].totalReturnsValue || 0),
      totalAdvancePayments: Number(advancesSummaryRows[0].totalAdvancePayments || 0),
    };

    report.salesOverTime = salesOverTime;
    report.earningsComparison = earningsComparison;
    report.topCategories = topCategories;
    report.topProducts = topProducts;
    report.topShops = topShops;
    report.lowStock = lowStock;
    report.returnsReport = returnsReport;
    report.advancePayments = advancePayments;
    report.inventoryMovement = inventoryMovement;
    report.profitability = profitability;
    report.shopSettlement = shopSettlement;

    res.json(report);
  } catch (err) {
    console.error("Reports error:", err);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
};
