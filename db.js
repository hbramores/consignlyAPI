const mongoose = require("mongoose");
const models = require("./models");

let connectionPromise = null;

function toNumber(value) {
  return Number(value || 0);
}

function toId(value) {
  return Number(value);
}

function asPlain(doc) {
  if (!doc) return doc;
  const value = typeof doc.toObject === "function" ? doc.toObject() : doc;
  delete value._id;
  delete value.__v;
  return value;
}

function sortByDateDesc(a, b) {
  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

function likeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

async function connect(callback) {
  if (!connectionPromise) {
    const uri = process.env.MONGODB_URI;
    

    if (!uri) {
      connectionPromise = Promise.reject(
        new Error("Missing MONGODB_STRING or MONGODB_URI in backend environment")
      );
    } else {
      connectionPromise = mongoose.connect(uri).then(() => {
        console.log("Connected to MongoDB");
      });
    }
  }

  try {
    await connectionPromise;
    if (callback) callback(null);
  } catch (err) {
    if (callback) callback(err);
    else throw err;
  }
}

async function nextId(name) {
  const counter = await models.Counter.findByIdAndUpdate(
    name,
    { $inc: { sequence: 1 } },
    { new: "after", upsert: true }
  );

  return counter.sequence;
}

async function insertWithId(Model, counterName, payload) {
  const doc = await Model.create({ id: await nextId(counterName), ...payload });
  return { insertId: doc.id, affectedRows: 1 };
}

async function getInventoryQuantity(productId) {
  const inventory = await models.MainInventory.findOne({ product_id: toId(productId) }).lean();
  return toNumber(inventory && inventory.quantity);
}

async function productRowsForUser(userId, includeStock = true) {
  const products = await models.Product.find({ user_id: toId(userId), status: "active" })
    .sort({ product_name: 1 })
    .lean();

  if (!includeStock) return products.map(asPlain);

  const inventory = await models.MainInventory.find({
    product_id: { $in: products.map((product) => product.id) },
  }).lean();
  const quantityByProduct = new Map(inventory.map((item) => [item.product_id, item.quantity]));

  return products.map((product) => ({
    ...asPlain(product),
    quantity: toNumber(quantityByProduct.get(product.id)),
  }));
}

async function shopRowsForUser(userId, status) {
  const shops = await models.Shop.find({ user_id: toId(userId), status }).sort({ shop_name: 1 }).lean();
  const sales = await models.Sale.find({ shop_id: { $in: shops.map((shop) => shop.id) } }).lean();
  const advances = await models.AdvancePayment.find({ shop_id: { $in: shops.map((shop) => shop.id) } }).lean();

  return shops.map((shop) => {
    const shopSales = sales.filter((sale) => sale.shop_id === shop.id);
    const totalSales = shopSales.reduce((sum, sale) => sum + toNumber(sale.total_amount), 0);
    const totalCommission = shopSales.reduce(
      (sum, sale) => sum + toNumber(sale.commission_amount) * toNumber(sale.quantity),
      0
    );
    const totalAdvance = advances
      .filter((advance) => advance.shop_id === shop.id)
      .reduce((sum, advance) => sum + toNumber(advance.amount), 0);

    return {
      ...asPlain(shop),
      outstanding_balance: totalSales - totalCommission - totalAdvance,
    };
  });
}

async function getShopInventoryRows(shopId) {
  const inventory = await models.ShopInventory.find({ shop_id: toId(shopId) }).lean();
  const [products, shops, sales, returns] = await Promise.all([
    models.Product.find({ id: { $in: inventory.map((item) => item.product_id) } }).lean(),
    models.Shop.find({ id: toId(shopId) }).lean(),
    models.Sale.find({ shop_id: toId(shopId) }).lean(),
    models.Return.find({ shop_id: toId(shopId) }).lean(),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const shop = shops[0] || {};

  return inventory.map((item) => {
    const product = productById.get(item.product_id) || {};
    const sold = sales
      .filter((sale) => sale.product_id === item.product_id)
      .reduce((sum, sale) => sum + toNumber(sale.quantity), 0);
    const returned = returns
      .filter((ret) => ret.product_id === item.product_id)
      .reduce((sum, ret) => sum + toNumber(ret.quantity), 0);

    return {
      product_id: product.id,
      product_name: product.product_name,
      product_code: product.product_code,
      base_price: product.base_price,
      image: product.image,
      category: product.category,
      contract_type: shop.contract_type,
      commission_rate: shop.commission_rate,
      quantity: toNumber(item.quantity),
      shop_selling_price: item.shop_selling_price,
      artisan_price: item.artisan_price,
      sold_quantity: sold,
      returned_quantity: returned,
    };
  });
}

async function getProductSummary(shopId) {
  const [inventory, sales, returns, products] = await Promise.all([
    models.ShopInventory.find({ shop_id: toId(shopId) }).lean(),
    models.Sale.find({ shop_id: toId(shopId) }).lean(),
    models.Return.find({ shop_id: toId(shopId), status: { $ne: "rejected" } }).lean(),
    models.Product.find().lean(),
  ]);

  const productIds = new Set([
    ...inventory.map((item) => item.product_id),
    ...sales.map((item) => item.product_id),
    ...returns.map((item) => item.product_id),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));

  return [...productIds]
    .map((productId) => {
      const product = productById.get(productId) || {};
      const remaining = inventory
        .filter((item) => item.product_id === productId)
        .reduce((sum, item) => sum + toNumber(item.quantity), 0);
      const soldRows = sales.filter((sale) => sale.product_id === productId);
      const sold = soldRows.reduce((sum, sale) => sum + toNumber(sale.quantity), 0);
      const totalSales = soldRows.reduce((sum, sale) => sum + toNumber(sale.total_amount), 0);
      const returned = returns
        .filter((ret) => ret.product_id === productId)
        .reduce((sum, ret) => sum + toNumber(ret.quantity), 0);

      return {
        product_id: productId,
        product_name: product.product_name,
        image: product.image,
        remaining,
        sold,
        returned,
        assigned: remaining + sold + returned,
        total_sales: totalSales,
      };
    })
    .sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
}

function buildDateMatcher(start, end) {
  if (!start || !end) return () => true;
  const startDate = new Date(start);
  const endDate = new Date(end);
  return (row) => new Date(row.created_at) >= startDate && new Date(row.created_at) <= endDate;
}

async function runQuery(sql, values = []) {
  await connect();
  const normalized = likeSql(sql);

  if (normalized.startsWith("create table") || normalized.startsWith("alter table")) return { affectedRows: 0 };
  if (normalized.startsWith("show columns from activity_logs")) {
    return ["user_id", "shop_id", "actor_type", "action", "entity_type", "entity_id", "details", "created_at"].map(
      (Field) => ({ Field })
    );
  }

  if (normalized === "select * from users where username = ?") {
    return models.User.find({ username: values[0] }).lean().then((rows) => rows.map(asPlain));
  }

  if (normalized === "update users set password = ? where id = ?") {
    const result = await models.User.updateOne({ id: toId(values[1]) }, { password: values[0] });
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("insert into users")) {
    return insertWithId(models.User, "users", {
      username: values[0],
      password: values[1],
      role: values[2],
      status: values[3],
    });
  }

  if (normalized.startsWith("select id, username, role, status, created_at from users")) {
    const rows = await models.User.find().sort({ created_at: -1 }).lean();
    return rows.map(asPlain);
  }

  if (normalized.startsWith("update users set status = 'inactive'")) {
    const result = await models.User.updateOne({ id: toId(values[0]), role: { $ne: "admin" } }, { status: "inactive" });
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("update users set status = 'approved'")) {
    const result = await models.User.updateOne({ id: toId(values[0]), role: { $ne: "admin" } }, { status: "approved" });
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.includes("from products") && normalized.includes("lower(trim(product_code))")) {
    if (normalized.includes("join products matching")) {
      const current = await models.Product.findOne({ id: toId(values[0]) }).lean();
      if (!current) return [];
      const match = await models.Product.findOne({
        user_id: current.user_id,
        product_code: new RegExp(`^${String(values[1]).trim()}$`, "i"),
        status: "active",
        id: { $ne: current.id },
      }).lean();
      return match ? [{ id: match.id }] : [];
    }

    const filter = {
      product_code: new RegExp(`^${String(values[0]).trim()}$`, "i"),
      user_id: toId(values[1]),
      status: "active",
    };
    if (values[2]) filter.id = { $ne: toId(values[2]) };
    const match = await models.Product.findOne(filter).lean();
    return match ? [{ id: match.id }] : [];
  }

  if (normalized.startsWith("select p.*, coalesce(mi.quantity, 0) as quantity from products")) {
    return productRowsForUser(values[0]);
  }

  if (normalized.startsWith("insert into products")) {
    return insertWithId(models.Product, "products", {
      product_code: values[0],
      category: values[1],
      product_name: values[2],
      description: values[3],
      image: values[4],
      base_price: toNumber(values[5]),
      minimum_stock: toNumber(values[6]),
      status: "active",
      user_id: toId(values[7]),
    });
  }

  if (normalized === "update products set status = 'inactive' where id = ?") {
    const result = await models.Product.updateOne({ id: toId(values[0]) }, { status: "inactive" });
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("update products set product_code=?")) {
    const hasImage = normalized.includes("image=?");
    const update = {
      product_code: values[0],
      category: values[1],
      product_name: values[2],
      description: values[3],
      base_price: toNumber(values[hasImage ? 5 : 4]),
      minimum_stock: toNumber(values[hasImage ? 6 : 5]),
    };
    if (hasImage) update.image = values[4];
    const id = values[hasImage ? 7 : 6];
    const result = await models.Product.updateOne({ id: toId(id) }, update);
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("select p.id, p.product_name, p.product_code, p.category")) {
    return productRowsForUser(values[0]);
  }

  if (normalized.startsWith("select id from products where id = ?")) {
    const product = await models.Product.findOne({ id: toId(values[0]), user_id: toId(values[1]), status: "active" }).lean();
    return product ? [{ id: product.id }] : [];
  }

  if (normalized.startsWith("select quantity from main_inventory where product_id = ?")) {
    const quantity = await getInventoryQuantity(values[0]);
    return quantity ? [{ quantity }] : [];
  }

  if (normalized.startsWith("insert into main_inventory")) {
    await models.MainInventory.findOneAndUpdate(
      { product_id: toId(values[0]) },
      { product_id: toId(values[0]), quantity: toNumber(values[1]), updated_at: new Date() },
      { upsert: true }
    );
    return { affectedRows: 1 };
  }

  if (normalized.startsWith("update main_inventory set quantity = quantity - ?")) {
    const result = await models.MainInventory.updateOne(
      { product_id: toId(values[1]) },
      { $inc: { quantity: -toNumber(values[0]) }, updated_at: new Date() }
    );
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("update main_inventory set quantity = quantity + ?")) {
    const result = await models.MainInventory.updateOne(
      { product_id: toId(values[1]) },
      { $inc: { quantity: toNumber(values[0]) }, updated_at: new Date() },
      { upsert: true }
    );
    return { affectedRows: result.modifiedCount || 1 };
  }

  if (normalized.startsWith("insert into stock_movements")) {
    return insertWithId(models.StockMovement, "stock_movements", {
      product_id: toId(values[0]),
      user_id: toId(values[1]),
      type: normalized.includes("'stock_in'") ? "stock_in" : values[2],
      quantity: toNumber(normalized.includes("'stock_in'") ? values[2] : values[3]),
      previous_stock: toNumber(normalized.includes("'stock_in'") ? values[3] : values[4]),
      new_stock: toNumber(normalized.includes("'stock_in'") ? values[4] : values[5]),
      notes: normalized.includes("'stock_in'") ? values[5] : values[6],
    });
  }

  if (normalized.startsWith("select sm.*, p.product_name")) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const movements = await models.StockMovement.find({ user_id: toId(values[0]), created_at: { $gte: cutoff } })
      .sort({ created_at: -1 })
      .lean();
    const products = await models.Product.find({ id: { $in: movements.map((movement) => movement.product_id) } }).lean();
    const productById = new Map(products.map((product) => [product.id, product]));
    return movements.map((movement) => ({
      ...asPlain(movement),
      product_name: productById.get(movement.product_id)?.product_name,
      image: productById.get(movement.product_id)?.image,
    }));
  }

  if (normalized.startsWith("insert into shops")) {
    return insertWithId(models.Shop, "shops", {
      shop_name: values[0],
      contact_person: values[1],
      phone_number: values[2],
      address: values[3],
      commission_rate: toNumber(values[4]),
      contract_type: values[5],
      access_code: values[6],
      status: "active",
      user_id: toId(values[7]),
    });
  }

  if (normalized.startsWith("select sh.*, coalesce(sales_data.total_sales")) {
    return shopRowsForUser(values[0], "active");
  }

  if (normalized.startsWith("insert into advance_payments")) {
    return insertWithId(models.AdvancePayment, "advance_payments", {
      shop_id: toId(values[0]),
      amount: toNumber(values[1]),
      note: values[2],
    });
  }

  if (normalized.startsWith("select * from shops where user_id = ? and status = 'inactive'")) {
    const rows = await models.Shop.find({ user_id: toId(values[0]), status: "inactive" }).lean();
    return rows.map(asPlain);
  }

  if (normalized.startsWith("select id, amount, note, created_at from advance_payments")) {
    const rows = await models.AdvancePayment.find({ shop_id: toId(values[0]) })
      .sort({ created_at: -1 })
      .limit(toNumber(values[1]) || 10)
      .lean();
    return rows.map(asPlain);
  }

  if (normalized.startsWith("update shops set shop_name")) {
    const result = await models.Shop.updateOne(
      { id: toId(values[5]) },
      {
        shop_name: values[0],
        contact_person: values[1],
        phone_number: values[2],
        address: values[3],
        commission_rate: toNumber(values[4]),
      }
    );
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("update shops set status = 'active'")) {
    const result = await models.Shop.updateOne({ id: toId(values[0]) }, { status: "active" });
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("update shops set status = 'inactive'")) {
    const result = await models.Shop.updateOne({ id: toId(values[0]) }, { status: "inactive" });
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("select id, shop_name from shops where user_id")) {
    const rows = await models.Shop.find({ user_id: toId(values[0]), status: "active" }).sort({ shop_name: 1 }).lean();
    return rows.map(({ id, shop_name }) => ({ id, shop_name }));
  }

  if (normalized.startsWith("select id, product_name, product_code from products")) {
    const rows = await models.Product.find({ user_id: toId(values[0]), status: "active" }).sort({ product_name: 1 }).lean();
    return rows.map(({ id, product_name, product_code }) => ({ id, product_name, product_code }));
  }

  if (normalized.startsWith("select id, shop_name, commission_rate")) {
    const rows = await models.Shop.find({ access_code: values[0], status: "active" }).lean();
    return rows.map(({ id, shop_name, commission_rate, contract_type, access_code, status }) => ({
      id,
      shop_name,
      commission_rate,
      contract_type,
      access_code,
      status,
    }));
  }

  if (normalized.startsWith("select contract_type, commission_rate from shops")) {
    const shop = await models.Shop.findOne({ id: toId(values[0]) }).lean();
    return shop ? [{ contract_type: shop.contract_type, commission_rate: shop.commission_rate }] : [];
  }

  if (normalized.startsWith("select mi.product_id")) {
    const productIds = values[0].map(toId);
    const [inventory, products] = await Promise.all([
      models.MainInventory.find({ product_id: { $in: productIds } }).lean(),
      models.Product.find({ id: { $in: productIds }, user_id: toId(values[1]) }).lean(),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    return inventory
      .filter((item) => productById.has(item.product_id))
      .map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        product_name: productById.get(item.product_id).product_name,
        base_price: productById.get(item.product_id).base_price,
      }));
  }

  if (normalized.startsWith("insert into shop_inventory")) {
    const rows = values[0];
    for (const row of rows) {
      await models.ShopInventory.findOneAndUpdate(
        { shop_id: toId(row[0]), product_id: toId(row[1]) },
        {
          $inc: { quantity: toNumber(row[2]) },
          $set: {
            user_id: toId(row[3]),
            shop_selling_price: toNumber(row[4]),
            artisan_price: toNumber(row[5]),
            updated_at: new Date(),
          },
        },
        { upsert: true }
      );
    }
    return { affectedRows: rows.length };
  }

  if (normalized.startsWith("select p.id as product_id, p.product_name, p.image")) {
    return getProductSummary(values[0]);
  }

  if (normalized.startsWith("select p.id as product_id")) {
    return getShopInventoryRows(values[0]);
  }

  if (normalized.startsWith("select p.id, p.product_name, p.category")) {
    const rows = await productRowsForUser(values[0]);
    return rows.map(({ id, product_name, category, quantity }) => ({ id, product_name, category, quantity }));
  }

  if (normalized.startsWith("update shop_inventory set shop_selling_price")) {
    const result = await models.ShopInventory.updateOne(
      { shop_id: toId(values[1]), product_id: toId(values[2]) },
      { shop_selling_price: toNumber(values[0]), updated_at: new Date() }
    );
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("select sum(si.quantity) as available_quantity")) {
    const item = await models.ShopInventory.findOne({ shop_id: toId(values[0]), product_id: toId(values[1]) }).lean();
    if (!item) return [];
    const [product, shop] = await Promise.all([
      models.Product.findOne({ id: item.product_id }).lean(),
      models.Shop.findOne({ id: item.shop_id }).lean(),
    ]);
    return [
      {
        available_quantity: item.quantity,
        product_name: product?.product_name,
        shop_selling_price: item.shop_selling_price,
        artisan_price: item.artisan_price,
        base_price: product?.base_price,
        contract_type: shop?.contract_type,
        commission_rate: shop?.commission_rate,
      },
    ];
  }

  if (normalized.startsWith("insert into sales")) {
    return insertWithId(models.Sale, "sales", {
      shop_id: toId(values[0]),
      product_id: toId(values[1]),
      quantity: toNumber(values[2]),
      total_amount: toNumber(values[3]),
      selling_price: toNumber(values[4]),
      artisan_price: toNumber(values[5]),
      commission_amount: toNumber(values[6]),
      artisan_earnings: toNumber(values[7]),
      contract_type: values[8],
    });
  }

  if (normalized.startsWith("update shop_inventory set quantity = quantity - ?")) {
    const result = await models.ShopInventory.updateOne(
      { shop_id: toId(values[1]), product_id: toId(values[2]) },
      { $inc: { quantity: -toNumber(values[0]) }, updated_at: new Date() }
    );
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("update shop_inventory set quantity = quantity + ?")) {
    const result = await models.ShopInventory.updateOne(
      { shop_id: toId(values[1]), product_id: toId(values[2]) },
      { $inc: { quantity: toNumber(values[0]) }, updated_at: new Date() }
    );
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("insert into returns")) {
    return insertWithId(models.Return, "returns", {
      shop_id: toId(values[0]),
      product_id: toId(values[1]),
      quantity: toNumber(values[2]),
      reason: values[3] || "",
      status: normalized.includes("'pending'") ? "pending" : "pending",
    });
  }

  if (normalized.startsWith("select product_id, quantity from shop_inventory")) {
    const rows = await models.ShopInventory.find({ shop_id: toId(values[0]), quantity: { $gt: 0 } }).lean();
    return rows.map(({ product_id, quantity }) => ({ product_id, quantity }));
  }

  if (normalized.startsWith("update shop_inventory set quantity = 0")) {
    const result = await models.ShopInventory.updateOne(
      { shop_id: toId(values[0]), product_id: toId(values[1]) },
      { quantity: 0, updated_at: new Date() }
    );
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("select s.id, s.quantity")) {
    const sales = await models.Sale.find({ shop_id: toId(values[0]) })
      .sort({ created_at: -1 })
      .limit(toNumber(values[1]) || 10)
      .lean();
    const products = await models.Product.find({ id: { $in: sales.map((sale) => sale.product_id) } }).lean();
    const productById = new Map(products.map((product) => [product.id, product]));
    return sales.map((sale) => ({
      id: sale.id,
      quantity: sale.quantity,
      total_amount: sale.total_amount,
      created_at: sale.created_at,
      product_name: productById.get(sale.product_id)?.product_name,
      selling_price: sale.selling_price,
      price: sale.selling_price,
      artisan_earnings: sale.artisan_earnings,
      commission_amount: sale.commission_amount,
    }));
  }

  if (normalized.startsWith("select r.id, r.quantity")) {
    const returns = await models.Return.find({ shop_id: toId(values[0]) })
      .sort({ created_at: -1 })
      .limit(toNumber(values[1]) || 10)
      .lean();
    const products = await models.Product.find({ id: { $in: returns.map((ret) => ret.product_id) } }).lean();
    const productById = new Map(products.map((product) => [product.id, product]));
    return returns.map((ret) => ({
      id: ret.id,
      quantity: ret.quantity,
      reason: ret.reason,
      status: ret.status,
      created_at: ret.created_at,
      product_name: productById.get(ret.product_id)?.product_name,
    }));
  }

  if (normalized.startsWith("select r.*, sh.shop_name, p.user_id")) {
    const ret = await models.Return.findOne({ id: toId(values[0]), status: "pending" }).lean();
    if (!ret) return [];
    const [shop, product] = await Promise.all([
      models.Shop.findOne({ id: ret.shop_id }).lean(),
      models.Product.findOne({ id: ret.product_id }).lean(),
    ]);
    return [{ ...asPlain(ret), shop_name: shop?.shop_name, user_id: product?.user_id }];
  }

  if (normalized.startsWith("select * from returns")) {
    const rows = await models.Return.find({ id: toId(values[0]), status: "pending" }).lean();
    return rows.map(asPlain);
  }

  if (normalized.startsWith("update returns set status = 'confirmed'")) {
    const result = await models.Return.updateOne({ id: toId(values[0]) }, { status: "confirmed" });
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("update returns set status = 'rejected'")) {
    const result = await models.Return.updateOne({ id: toId(values[0]) }, { status: "rejected" });
    return { affectedRows: result.modifiedCount };
  }

  if (normalized.startsWith("select coalesce(sum(total_amount), 0) as total_sales")) {
    const sales = await models.Sale.find({ shop_id: toId(values[0]) }).lean();
    return [
      {
        total_sales: sales.reduce((sum, sale) => sum + toNumber(sale.total_amount), 0),
        total_commission: sales.reduce((sum, sale) => sum + toNumber(sale.commission_amount) * toNumber(sale.quantity), 0),
        total_sold_items: sales.reduce((sum, sale) => sum + toNumber(sale.quantity), 0),
      },
    ];
  }

  if (normalized.startsWith("select coalesce(sum(amount), 0) as total_advance")) {
    const rows = await models.AdvancePayment.find({ shop_id: toId(values[0]) }).lean();
    return [{ total_advance: rows.reduce((sum, row) => sum + toNumber(row.amount), 0) }];
  }

  if (normalized.startsWith("select coalesce(sum(quantity), 0) as pending_returns")) {
    const rows = await models.Return.find({ shop_id: toId(values[0]), status: "pending" }).lean();
    return [{ pending_returns: rows.reduce((sum, row) => sum + toNumber(row.quantity), 0) }];
  }

  if (normalized.startsWith("select count(*) as totalproducts")) {
    return [{ totalProducts: await models.Product.countDocuments({ status: "active", user_id: toId(values[0]) }) }];
  }

  if (normalized.startsWith("select ifnull(sum(mi.quantity), 0) as totalstocks")) {
    const products = await models.Product.find({ user_id: toId(values[0]) }).lean();
    const inv = await models.MainInventory.find({ product_id: { $in: products.map((p) => p.id) } }).lean();
    return [{ totalStocks: inv.reduce((sum, row) => sum + toNumber(row.quantity), 0) }];
  }

  if (normalized.startsWith("select count(*) as totalshops")) {
    return [{ totalShops: await models.Shop.countDocuments({ status: "active", user_id: toId(values[0]) }) }];
  }

  if (normalized.startsWith("select coalesce(sum(s.total_amount), 0) as total_sales")) {
    const shops = await models.Shop.find({ user_id: toId(values[0]) }).lean();
    const sales = await models.Sale.find({ shop_id: { $in: shops.map((shop) => shop.id) } }).lean();
    return [{ total_sales: sales.reduce((sum, sale) => sum + toNumber(sale.total_amount), 0) }];
  }

  if (normalized.startsWith("select count(*) as lowstockcount")) {
    const rows = await productRowsForUser(values[0]);
    return [{ lowStockCount: rows.filter((row) => toNumber(row.quantity) <= toNumber(row.minimum_stock)).length }];
  }

  if (normalized.startsWith("select * from activity_logs")) {
    const filter = {};
    let limit = 100;
    if (normalized.includes("where user_id = ?") && normalized.includes("shop_id = ?")) {
      filter.user_id = toId(values[0]);
      filter.shop_id = toId(values[1]);
      limit = toNumber(values[2]);
    } else if (normalized.includes("where user_id = ?")) {
      filter.user_id = toId(values[0]);
      limit = toNumber(values[1]);
    } else if (normalized.includes("where shop_id = ?")) {
      filter.shop_id = toId(values[0]);
      limit = toNumber(values[1]);
    } else {
      limit = toNumber(values[0]);
    }
    const rows = await models.ActivityLog.find(filter).sort({ created_at: -1 }).limit(limit || 100).lean();
    return rows.map(asPlain);
  }

  if (normalized.startsWith("insert into activity_logs")) {
    return insertWithId(models.ActivityLog, "activity_logs", {
      user_id: values[0] == null ? null : toId(values[0]),
      shop_id: values[1] == null ? null : toId(values[1]),
      actor_type: values[2],
      action: values[3],
      entity_type: values[4],
      entity_id: values[5] == null ? null : toId(values[5]),
      details: values[6],
    });
  }

  throw new Error(`Unsupported Mongo query adapter SQL: ${String(sql).slice(0, 180)}`);
}

function query(sql, values, callback) {
  let params = values;
  let cb = callback;

  if (typeof values === "function") {
    cb = values;
    params = [];
  }

  runQuery(sql, params || [])
    .then((result) => cb && cb(null, result))
    .catch((err) => cb && cb(err));
}

function promise() {
  return {
    query: async (sql, values = []) => {
      const rows = await runQuery(sql, values);
      return [rows];
    },
  };
}

module.exports = {
  connect,
  query,
  promise,
  mongoose,
  models,
  helpers: {
    asPlain,
    buildDateMatcher,
    getInventoryQuantity,
    getProductSummary,
    getShopInventoryRows,
    productRowsForUser,
    shopRowsForUser,
    sortByDateDesc,
    toId,
    toNumber,
  },
};
