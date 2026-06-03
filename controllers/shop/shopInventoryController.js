// has function assignInventory, getShopInventory, getAvailableProducts, and updateShopSellingPrice for shop inventory management
//ShopInventoryController.js
const db = require("../../db");
const { logActivity } = require("../../utils/activityLogger");
const { isInteger } = require("../../utils/validation");

// Assign Inventory to Shop
exports.assignInventory = (req, res) => {
  const { shop_id, product_ids, quantity, user_id } = req.body;
  const assignQty = Number(quantity);

  if (
    !Array.isArray(product_ids) ||
    product_ids.length === 0 ||
    !isInteger(quantity) ||
    assignQty <= 0
  ) {
    return res.status(400).json({ success: false, message: "Invalid inventory field format" });
  }

  const checkSql = `
    SELECT 
      mi.product_id,
      mi.quantity,
      p.product_name,
      p.base_price
    FROM main_inventory mi
    JOIN products p ON mi.product_id = p.id
    WHERE mi.product_id IN (?) AND p.user_id = ?
  `;

  const shopSql = `SELECT contract_type, commission_rate FROM shops WHERE id = ?`;

  db.query(shopSql, [shop_id], (err, shopResult) => {
    if (err) {
      return res.status(500).json({ success: false, message: "Failed to get shop" });
    }

    const contractType = shopResult[0].contract_type;
    const commissionRate = Number(shopResult[0].commission_rate) || 0;

  db.query(checkSql, [product_ids, user_id], (err, stocks) => {
    if (err) {
      console.error("CHECK STOCK ERROR:", err);
      return res.status(500).json({ success: false, message: "Failed to check stocks" });
    }

    for (const productId of product_ids) {
      const stock = stocks.find((s) => Number(s.product_id) === Number(productId));

      if (!stock || Number(stock.quantity) < assignQty) {
        return res.status(400).json({
          success: false,
          message: `Not enough stock for ${stock ? stock.product_name : "product ID " + productId}`,
        });
      }
    }

    const values = product_ids.map((product_id) => {
      const product = stocks.find((s) => Number(s.product_id) === Number(product_id));

      return [
        shop_id,
        product_id,
        assignQty,
        user_id,
        contractType === "manual_pricing"
          ? Number(product.base_price)
          : Number(product.base_price) + (Number(product.base_price) * commissionRate / 100),
        Number(product.base_price)
      ];
    });

    const insertSql = `
    INSERT INTO shop_inventory
    (shop_id, product_id, quantity, user_id, shop_selling_price, artisan_price)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      quantity = quantity + VALUES(quantity),
      shop_selling_price = VALUES(shop_selling_price),
      artisan_price = VALUES(artisan_price)
  `;

    db.query(insertSql, [values], (err) => {
      if (err) {
        console.error("INSERT SHOP INVENTORY ERROR:", err);
        return res.status(500).json({ success: false, message: "Failed to assign inventory" });
      }

      product_ids.forEach((product_id) => {
        const updateSql = `
          UPDATE main_inventory
          SET quantity = quantity - ?
          WHERE product_id = ?
        `;

        db.query(updateSql, [assignQty, product_id]);
      });

      logActivity({
        user_id,
        shop_id,
        actor_type: "user",
        action: "assigned_inventory",
        entity_type: "shop_inventory",
        entity_id: shop_id,
        details: { product_ids, quantity: assignQty },
      });

      res.json({
        success: true,
        message: "Inventory assigned and deducted from main inventory",
        });
      });
    });
  });
};

// Get Shop Inventory
exports.getShopInventory = (req, res) => {
  const { shop_id } = req.params;

  const sql = `
    SELECT 
      p.id AS product_id,
      p.product_name,
      p.product_code,
      p.base_price,
      p.image,
      p.category,

      sh.contract_type,
      sh.commission_rate,

      COALESCE(si.quantity, 0) AS quantity,
      si.shop_selling_price,
      si.artisan_price,
      COALESCE(s.sold_quantity, 0) AS sold_quantity,
      COALESCE(r.returned_quantity, 0) AS returned_quantity

    FROM shop_inventory si
    JOIN products p 
      ON si.product_id = p.id

    JOIN shops sh
      ON si.shop_id = sh.id

    LEFT JOIN (
      SELECT product_id, shop_id, SUM(quantity) AS sold_quantity
      FROM sales
      GROUP BY product_id, shop_id
    ) s ON si.product_id = s.product_id AND si.shop_id = s.shop_id

    LEFT JOIN (
      SELECT product_id, shop_id, SUM(quantity) AS returned_quantity
      FROM returns
      GROUP BY product_id, shop_id
    ) r ON si.product_id = r.product_id AND si.shop_id = r.shop_id

    WHERE si.shop_id = ?
  `;

  db.query(sql, [shop_id], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to fetch shop inventory" });
    }

    res.json(result);
  });
};


// Get Products with Available Stock
exports.getAvailableProducts = (req, res) => {
  const { user_id } = req.query;

  const sql = `
    SELECT 
      p.id,
      p.product_name,
      p.category,
      COALESCE(mi.quantity, 0) AS quantity
    FROM products p
    LEFT JOIN main_inventory mi ON p.id = mi.product_id
    WHERE p.user_id = ?
    AND p.status = 'active'
  `;

  db.query(sql, [user_id], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to fetch products" });
    }

    res.json(result);
  });
};

// Update Shop Selling Price
exports.updateShopSellingPrice = (req, res) => {
  const { shop_id, product_id } = req.params;
  const { shop_selling_price } = req.body;

  if (!shop_selling_price || Number(shop_selling_price) <= 0) {
    return res.status(400).json({ message: "Invalid price" });
  }

  const sql = `
    UPDATE shop_inventory
    SET shop_selling_price = ?
    WHERE shop_id = ? AND product_id = ?
  `;

  db.query(sql, [shop_selling_price, shop_id, product_id], (err) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to update price" });
    }

    logActivity({
      shop_id,
      actor_type: "shop_owner",
      action: "updated_shop_selling_price",
      entity_type: "product",
      entity_id: product_id,
      details: { shop_selling_price },
    });

    res.json({
      success: true,
      message: "Selling price updated"
    });
  });
};
