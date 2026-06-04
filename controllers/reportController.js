const db = require("../db");
const { models, helpers } = db;

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

  return start ? { start, end } : null;
}

function inRange(row, range) {
  if (!range) return true;
  const date = new Date(row.created_at);
  return date >= range.start && date <= range.end;
}

function groupSum(rows, keyFn, valueFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    map.set(key, (map.get(key) || 0) + valueFn(row));
  });
  return map;
}

exports.getReportFilters = async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ message: "user_id is required" });
  }

  try {
    await db.connect();
    const [shops, products] = await Promise.all([
      models.Shop.find({ user_id: helpers.toId(user_id), status: "active" })
        .sort({ shop_name: 1 })
        .select("id shop_name -_id")
        .lean(),
      models.Product.find({ user_id: helpers.toId(user_id), status: "active" })
        .sort({ product_name: 1 })
        .select("id product_name product_code -_id")
        .lean(),
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

  try {
    await db.connect();

    const uid = helpers.toId(user_id);
    const range = getDateRange(req.query);
    const includeSales = !transaction_type || transaction_type === "all" || transaction_type === "sales";
    const includeReturns = !transaction_type || transaction_type === "all" || transaction_type === "returns";
    const includeAdvances = !transaction_type || transaction_type === "all" || transaction_type === "advances";

    const [shops, products, inventory, shopInventory, allSales, allReturns, allAdvances] = await Promise.all([
      models.Shop.find({ user_id: uid }).lean(),
      models.Product.find({ user_id: uid, status: "active" }).lean(),
      models.MainInventory.find().lean(),
      models.ShopInventory.find().lean(),
      models.Sale.find().lean(),
      models.Return.find().lean(),
      models.AdvancePayment.find().lean(),
    ]);

    const shopIds = new Set(shops.map((shop) => shop.id));
    const productIds = new Set(products.map((product) => product.id));
    const productById = new Map(products.map((product) => [product.id, product]));
    const shopById = new Map(shops.map((shop) => [shop.id, shop]));
    const inventoryByProduct = new Map(inventory.map((item) => [item.product_id, item.quantity]));

    const filterCommon = (row) =>
      shopIds.has(row.shop_id) &&
      productIds.has(row.product_id) &&
      inRange(row, range) &&
      (!req.query.shop_id || req.query.shop_id === "all" || row.shop_id === helpers.toId(req.query.shop_id)) &&
      (!req.query.product_id || req.query.product_id === "all" || row.product_id === helpers.toId(req.query.product_id));

    const sales = includeSales ? allSales.filter(filterCommon) : [];
    const returns = includeReturns ? allReturns.filter(filterCommon) : [];
    const advances = includeAdvances
      ? allAdvances.filter(
          (row) =>
            shopIds.has(row.shop_id) &&
            inRange(row, range) &&
            (!req.query.shop_id || req.query.shop_id === "all" || row.shop_id === helpers.toId(req.query.shop_id))
        )
      : [];

    const totalSales = sales.reduce((sum, sale) => sum + helpers.toNumber(sale.total_amount), 0);
    const totalArtisanEarnings = sales.reduce(
      (sum, sale) => sum + helpers.toNumber(sale.artisan_earnings) * helpers.toNumber(sale.quantity),
      0
    );
    const totalShopEarnings = sales.reduce(
      (sum, sale) => sum + helpers.toNumber(sale.commission_amount) * helpers.toNumber(sale.quantity),
      0
    );

    const salesByDate = groupSum(
      sales,
      (sale) => new Date(sale.created_at).toISOString().slice(0, 10),
      (sale) => helpers.toNumber(sale.total_amount)
    );

    const salesByCategory = groupSum(
      sales,
      (sale) => productById.get(sale.product_id)?.category || "Uncategorized",
      (sale) => helpers.toNumber(sale.quantity)
    );

    const salesByProduct = [...groupSum(sales, (sale) => sale.product_id, (sale) => helpers.toNumber(sale.quantity))]
      .map(([productId, total_sold]) => {
        const productSales = sales.filter((sale) => sale.product_id === productId);
        return {
          product_name: productById.get(productId)?.product_name,
          product_code: productById.get(productId)?.product_code,
          total_sold,
          revenue: productSales.reduce((sum, sale) => sum + helpers.toNumber(sale.total_amount), 0),
          artisan_earnings: productSales.reduce(
            (sum, sale) => sum + helpers.toNumber(sale.artisan_earnings) * helpers.toNumber(sale.quantity),
            0
          ),
          shop_earnings: productSales.reduce(
            (sum, sale) => sum + helpers.toNumber(sale.commission_amount) * helpers.toNumber(sale.quantity),
            0
          ),
        };
      })
      .sort((a, b) => b.total_sold - a.total_sold || b.revenue - a.revenue)
      .slice(0, 10);

    const salesByShop = [...groupSum(sales, (sale) => sale.shop_id, (sale) => helpers.toNumber(sale.total_amount))]
      .map(([shopId, shopTotal]) => {
        const shopSales = sales.filter((sale) => sale.shop_id === shopId);
        return {
          shop_name: shopById.get(shopId)?.shop_name,
          total_sales: shopTotal,
          products_sold: shopSales.reduce((sum, sale) => sum + helpers.toNumber(sale.quantity), 0),
          artisan_earnings: shopSales.reduce(
            (sum, sale) => sum + helpers.toNumber(sale.artisan_earnings) * helpers.toNumber(sale.quantity),
            0
          ),
          shop_earnings: shopSales.reduce(
            (sum, sale) => sum + helpers.toNumber(sale.commission_amount) * helpers.toNumber(sale.quantity),
            0
          ),
        };
      })
      .sort((a, b) => b.total_sales - a.total_sales)
      .slice(0, 10);

    const report = {
      ...emptyReport,
      summary: {
        totalSales,
        totalArtisanEarnings,
        totalShopEarnings,
        productsSold: sales.reduce((sum, sale) => sum + helpers.toNumber(sale.quantity), 0),
        totalReturnsQuantity: returns.reduce((sum, ret) => sum + helpers.toNumber(ret.quantity), 0),
        totalReturnsValue: returns.reduce((sum, ret) => {
          const product = productById.get(ret.product_id);
          const shopItem = shopInventory.find((item) => item.shop_id === ret.shop_id && item.product_id === ret.product_id);
          return sum + helpers.toNumber(ret.quantity) * helpers.toNumber(shopItem?.artisan_price || product?.base_price);
        }, 0),
        totalAdvancePayments: advances.reduce((sum, advance) => sum + helpers.toNumber(advance.amount), 0),
      },
      salesOverTime: [...salesByDate].map(([period, sales]) => ({ period, sales })).sort((a, b) => a.period.localeCompare(b.period)),
      earningsComparison: [
        { name: "Artisan Earnings", value: totalArtisanEarnings },
        { name: "Shop Earnings", value: totalShopEarnings },
      ],
      topCategories: [...salesByCategory].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      topProducts: salesByProduct,
      topShops: salesByShop,
      lowStock: products
        .map((product) => {
          const current_stock = helpers.toNumber(inventoryByProduct.get(product.id));
          const minimum_stock = helpers.toNumber(product.minimum_stock);
          return {
            product_name: product.product_name,
            current_stock,
            minimum_stock,
            status: current_stock <= 0 ? "Critical" : current_stock <= minimum_stock ? "Low" : "Safe",
          };
        })
        .sort((a, b) => {
          const rank = { Critical: 1, Low: 2, Safe: 3 };
          return rank[a.status] - rank[b.status] || a.product_name.localeCompare(b.product_name);
        }),
      returnsReport: returns
        .map((ret) => ({
          created_at: ret.created_at,
          product_name: productById.get(ret.product_id)?.product_name,
          shop_name: shopById.get(ret.shop_id)?.shop_name,
          quantity: ret.quantity,
          reason: ret.reason,
          status: ret.status,
        }))
        .sort(helpers.sortByDateDesc)
        .slice(0, 50),
      advancePayments: advances
        .map((advance) => ({
          shop_name: shopById.get(advance.shop_id)?.shop_name,
          amount: advance.amount,
          note: advance.note,
          created_at: advance.created_at,
        }))
        .sort(helpers.sortByDateDesc)
        .slice(0, 50),
      inventoryMovement: products.map((product) => {
        const assigned = shopInventory
          .filter((item) => item.product_id === product.id)
          .reduce((sum, item) => sum + helpers.toNumber(item.quantity), 0);
        const sold = allSales
          .filter((sale) => sale.product_id === product.id)
          .reduce((sum, sale) => sum + helpers.toNumber(sale.quantity), 0);
        const returned = allReturns
          .filter((ret) => ret.product_id === product.id && ret.status === "confirmed")
          .reduce((sum, ret) => sum + helpers.toNumber(ret.quantity), 0);
        const remaining = helpers.toNumber(inventoryByProduct.get(product.id)) + assigned;

        return {
          product_name: product.product_name,
          initial_quantity: remaining + sold + returned,
          assigned: assigned + sold + returned,
          sold,
          returned,
          damaged: 0,
          remaining,
        };
      }),
      profitability: salesByProduct
        .map((item) => ({
          product_name: item.product_name,
          revenue: item.revenue,
          artisan_profit: item.artisan_earnings,
          shop_profit: item.shop_earnings,
          net_earnings: item.artisan_earnings + item.shop_earnings,
        }))
        .sort((a, b) => b.net_earnings - a.net_earnings)
        .slice(0, 20),
      shopSettlement: await helpers.shopRowsForUser(uid, "active"),
    };

    report.shopSettlement = report.shopSettlement
      .map((shop) => ({
        shop_name: shop.shop_name,
        total_sales: sales
          .filter((sale) => sale.shop_id === shop.id)
          .reduce((sum, sale) => sum + helpers.toNumber(sale.total_amount), 0),
        shop_earnings: sales
          .filter((sale) => sale.shop_id === shop.id)
          .reduce((sum, sale) => sum + helpers.toNumber(sale.commission_amount) * helpers.toNumber(sale.quantity), 0),
        advance_payments: advances
          .filter((advance) => advance.shop_id === shop.id)
          .reduce((sum, advance) => sum + helpers.toNumber(advance.amount), 0),
        remaining_balance: shop.outstanding_balance,
      }))
      .sort((a, b) => b.total_sales - a.total_sales);

    res.json(report);
  } catch (err) {
    console.error("Reports error:", err);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
};
