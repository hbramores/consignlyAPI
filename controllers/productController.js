// has 4 functions: getProducts, addProduct, deleteProduct, updateProduct.

const db = require('../db');
const { logActivity } = require("../utils/activityLogger");
const {
  CODE_PATTERN,
  NAME_PATTERN,
  isOptionalText,
  isPositiveNumber,
  isRequiredText,
  trimmed,
} = require("../utils/validation");

function normalizeCategory(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function checkProductCodeExistsForUser(productCode, userId, excludedProductId, callback) {
  const values = [productCode, userId];
  let excludeSql = "";

  if (excludedProductId) {
    excludeSql = "AND id <> ?";
    values.push(excludedProductId);
  }

  const sql = `
    SELECT id
    FROM products
    WHERE LOWER(TRIM(product_code)) = LOWER(?)
    AND user_id = ?
    AND status = 'active'
    ${excludeSql}
    LIMIT 1
  `;

  db.query(sql, values, callback);
}

function checkProductCodeExistsForProductOwner(productCode, productId, callback) {
  const sql = `
    SELECT matching.id
    FROM products current_product
    JOIN products matching
      ON matching.user_id = current_product.user_id
    WHERE current_product.id = ?
    AND LOWER(TRIM(matching.product_code)) = LOWER(?)
    AND matching.status = 'active'
    AND matching.id <> current_product.id
    LIMIT 1
  `;

  db.query(sql, [productId, productCode], callback);
}

// Get products by user
exports.getProducts = (req, res) => {
  const { user_id } = req.params;

  const sql = `
    SELECT 
      p.*,
      COALESCE(mi.quantity, 0) AS quantity
    FROM products p
    LEFT JOIN main_inventory mi ON p.id = mi.product_id
    WHERE p.status = 'active' AND p.user_id = ?
  `;

  db.query(sql, [user_id], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to fetch products" });
    }

    res.json(result);
  });
};

// Add product
exports.addProduct = (req, res) => {
  const {
    product_code,
    category,
    product_name,
    description,
    base_price,
    minimum_stock,
    user_id
  } = req.body;

  const image = req.file ? req.file.filename : null;
  const normalizedProductCode = trimmed(product_code);
  const normalizedCategory = normalizeCategory(category);

  if (
    !isRequiredText(product_code, CODE_PATTERN) ||
    !isRequiredText(category, NAME_PATTERN) ||
    !isRequiredText(product_name, NAME_PATTERN) ||
    !isOptionalText(description) ||
    !isPositiveNumber(base_price) ||
    !isPositiveNumber(minimum_stock)
  ) {
    return res.status(400).json({ message: "Invalid product field format" });
  }

  checkProductCodeExistsForUser(normalizedProductCode, user_id, null, (err, existingProduct) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to check product code" });
    }

    if (existingProduct.length > 0) {
      return res.status(400).json({ message: "Product code already exists" });
    }

    const sql = `
      INSERT INTO products 
      (product_code, category, product_name, description, image, base_price, minimum_stock, status, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `;

    const values = [
      normalizedProductCode,
      normalizedCategory,
      product_name,
      description,
      image,
      base_price,
      minimum_stock,
      user_id
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("DB ERROR:", err);
        return res.status(500).json({ message: "Failed to add product" });
      }

      logActivity({
        user_id,
        actor_type: "user",
        action: "created_product",
        entity_type: "product",
        entity_id: result.insertId,
        details: { product_code: normalizedProductCode, product_name, category: normalizedCategory },
      });

      res.json({ message: "Product added successfully" });
    });
  });
};

// Delete product 
exports.deleteProduct = (req, res) => {
  const { id } = req.params;

  const sql = "UPDATE products SET status = 'inactive' WHERE id = ?";

  db.query(sql, [id], (err) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to delete product" });
    }

    logActivity({
      actor_type: "user",
      action: "deleted_product",
      entity_type: "product",
      entity_id: id,
    });

    res.json({ message: "Product deleted successfully" });
  });
};

// Update product
exports.updateProduct = (req, res) => {
  const { id } = req.params;

  const {
    product_code,
    category,
    product_name,
    description,
    base_price,
    minimum_stock
  } = req.body;

  const normalizedProductCode = trimmed(product_code);
  const normalizedCategory = normalizeCategory(category);

  if (
    !isRequiredText(product_code, CODE_PATTERN) ||
    !isRequiredText(category, NAME_PATTERN) ||
    !isRequiredText(product_name, NAME_PATTERN) ||
    !isOptionalText(description) ||
    !isPositiveNumber(base_price) ||
    !isPositiveNumber(minimum_stock)
  ) {
    return res.status(400).json({ message: "Invalid product field format" });
  }

  checkProductCodeExistsForProductOwner(normalizedProductCode, id, (err, existingProduct) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Failed to check product code" });
    }

    if (existingProduct.length > 0) {
      return res.status(400).json({ message: "Product code already exists" });
    }

    let sql;
    let values;

    if (req.file) {
      const image = req.file.filename;

      sql = `
        UPDATE products
        SET product_code=?, category=?, product_name=?, description=?, image=?, base_price=?, minimum_stock=?
        WHERE id=?
      `;

      values = [
        normalizedProductCode,
        normalizedCategory,
        product_name,
        description,
        image,
        base_price,
        minimum_stock,
        id
      ];
    } else {
      sql = `
        UPDATE products
        SET product_code=?, category=?, product_name=?, description=?, base_price=?, minimum_stock=?
        WHERE id=?
      `;

      values = [
        normalizedProductCode,
        normalizedCategory,
        product_name,
        description,
        base_price,
        minimum_stock,
        id
      ];
    }

    db.query(sql, values, (err) => {
      if (err) {
        console.error("DB ERROR:", err);
        return res.status(500).json({ message: "Failed to update product" });
      }

      logActivity({
        actor_type: "user",
        action: "updated_product",
        entity_type: "product",
        entity_id: id,
        details: { product_code: normalizedProductCode, product_name, category: normalizedCategory },
      });

      res.json({ message: "Product updated successfully" });
    });
  });
};
