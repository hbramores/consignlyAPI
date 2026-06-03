// has function createshop, getshops, recordadvance, getarchivedshops, getadvancepayments, updateshop, activateShop, and archiveShop for shop management
//shopManagementController.js
const db = require("../../db");
const { logActivity } = require("../../utils/activityLogger");
const {
  NAME_PATTERN,
  PHONE_PATTERN,
  isOptionalText,
  isPositiveNumber,
  isRequiredText,
} = require("../../utils/validation");

// Create Shop
exports.createShop = (req, res) => {
  const {
    shop_name,
    contact_person,
    phone_number,
    address,
    commission_rate,
    contract_type,
    user_id
  } = req.body;

  if (
    !isRequiredText(shop_name, NAME_PATTERN) ||
    !isRequiredText(contact_person, NAME_PATTERN) ||
    !isRequiredText(phone_number, PHONE_PATTERN) ||
    !isRequiredText(address) ||
    !["percentage", "manual_pricing"].includes(contract_type) ||
    (contract_type === "percentage" && (Number(commission_rate) < 0 || Number(commission_rate) > 100))
  ) {
    return res.status(400).json({ message: "Invalid shop field format" });
  }

  // generate access code
  const access_code = "SHOP" + Math.floor(1000 + Math.random() * 9000);

  const sql = `
    INSERT INTO shops 
    (shop_name, contact_person, phone_number, address, commission_rate, contract_type, access_code, status, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `;

  db.query(
    sql,
    [shop_name, contact_person, phone_number, address, commission_rate, contract_type, access_code, user_id],
    (err, result) => {
      if (err) {
        console.error("DB ERROR:", err);
        return res.status(500).json({ message: "Failed to create shop" });
      }

      logActivity({
        user_id,
        shop_id: result.insertId,
        actor_type: "user",
        action: "created_shop",
        entity_type: "shop",
        entity_id: result.insertId,
        details: { shop_name, contract_type },
      });

      res.json({
        success: true,
        message: "Shop created",
        access_code
      });
    }
  );
};


// Get Shops by User
exports.getShops = (req, res) => {
  const { user_id } = req.params;

  const sql = `
    SELECT
      sh.*,
      COALESCE(sales_data.total_sales, 0) -
        COALESCE(sales_data.total_commission, 0) -
        COALESCE(advance_data.total_advance, 0) AS outstanding_balance
    FROM shops sh
    LEFT JOIN (
      SELECT
        shop_id,
        SUM(total_amount) AS total_sales,
        SUM(commission_amount * quantity) AS total_commission
      FROM sales
      GROUP BY shop_id
    ) sales_data ON sh.id = sales_data.shop_id
    LEFT JOIN (
      SELECT shop_id, SUM(amount) AS total_advance
      FROM advance_payments
      GROUP BY shop_id
    ) advance_data ON sh.id = advance_data.shop_id
    WHERE sh.user_id = ? AND sh.status = 'active'
    ORDER BY sh.shop_name ASC
  `;

  db.query(sql, [user_id], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to fetch shops" });
    }

    res.json(result);
  });
};

// Record Advance Payment
exports.recordAdvance = (req, res) => {
  const { shop_id, amount, note } = req.body;

  if (!isPositiveNumber(amount) || !isOptionalText(note)) {
    return res.status(400).json({ message: "Invalid advance payment field format" });
  }

  const sql = `
    INSERT INTO advance_payments
    (shop_id, amount, note)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [shop_id, amount, note], (err) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to record advance" });
    }

    logActivity({
      shop_id,
      actor_type: "user",
      action: "recorded_advance_payment",
      entity_type: "advance_payment",
      details: { amount, note },
    });

    res.json({
      success: true,
      message: "Advance payment recorded"
    });
  });
};

exports.getArchivedShops = (req, res) => {
  const { user_id } = req.params;

  const sql = `
    SELECT * FROM shops
    WHERE user_id = ? AND status = 'inactive'
  `;

  db.query(sql, [user_id], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to fetch archived shops" });
    }

    res.json(result);
  });
};

// Get Advance Payment Transactions
exports.getAdvancePayments = (req, res) => {
  const { shop_id } = req.params;
  const limit = Number(req.query.limit) || 10;

  const sql = `
    SELECT
      id,
      amount,
      note,
      created_at
    FROM advance_payments
    WHERE shop_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `;

  db.query(sql, [shop_id, limit], (err, result) => {
    if (err) {
      console.error("Advance payments error:", err);
      return res.status(500).json({ message: "Failed to fetch advance payments" });
    }

    res.json(result);
  });
};

// Update Shop
exports.updateShop = (req, res) => {
  const { shop_id } = req.params;
  const {
    shop_name,
    contact_person,
    phone_number,
    address,
    commission_rate,
  } = req.body;

  if (
    !isRequiredText(shop_name, NAME_PATTERN) ||
    !isRequiredText(contact_person, NAME_PATTERN) ||
    !isRequiredText(phone_number, PHONE_PATTERN) ||
    !isRequiredText(address) ||
    (Number(commission_rate) < 0 || Number(commission_rate) > 100)
  ) {
    return res.status(400).json({ message: "Invalid shop field format" });
  }

  const sql = `
    UPDATE shops
    SET shop_name = ?,
        contact_person = ?,
        phone_number = ?,
        address = ?,
        commission_rate = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [shop_name, contact_person, phone_number, address, commission_rate, shop_id],
    (err) => {
      if (err) {
        console.error("DB ERROR:", err);
        return res.status(500).json({ message: "Failed to update shop" });
      }

      logActivity({
        shop_id,
        actor_type: "user",
        action: "updated_shop",
        entity_type: "shop",
        entity_id: shop_id,
        details: { shop_name, contact_person },
      });

      res.json({
        success: true,
        message: "Shop updated",
      });
    }
  );
};

// Activate Archived Shop
exports.activateShop = (req, res) => {
  const { shop_id } = req.params;

  const sql = `
    UPDATE shops
    SET status = 'active'
    WHERE id = ?
  `;

  db.query(sql, [shop_id], (err) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to activate shop" });
    }

    logActivity({
      shop_id,
      actor_type: "user",
      action: "activated_shop",
      entity_type: "shop",
      entity_id: shop_id,
    });

    res.json({
      success: true,
      message: "Shop activated",
    });
  });
};

// Archive Shop
exports.archiveShop = (req, res) => {
  const { shop_id } = req.params;

  const sql = `
    UPDATE shops
    SET status = 'inactive'
    WHERE id = ?
  `;

  db.query(sql, [shop_id], (err) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to archive shop" });
    }

    logActivity({
      shop_id,
      actor_type: "user",
      action: "archived_shop",
      entity_type: "shop",
      entity_id: shop_id,
    });

    res.json({
      success: true,
      message: "Shop archived",
    });
  });
};
