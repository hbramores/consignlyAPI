const express = require("express");
const router = express.Router();

const {
  getUsers,
  deactivateUser,
  approveUser,
} = require("../controllers/userController");

router.get("/", getUsers);

router.delete("/:id", deactivateUser);

router.put("/:id/approve", approveUser);

module.exports = router;
