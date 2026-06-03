//has functions to handle shop related operations such as authentication, management, inventory, transactions, and dashboard
module.exports = {
  ...require("./shop/shopAuthController"),
  ...require("./shop/shopManagementController"),
  ...require("./shop/shopInventoryController"),
  ...require("./shop/shopTransactionController"),
  ...require("./shop/shopDashboardController"),
};
