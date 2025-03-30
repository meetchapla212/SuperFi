var router = require("express").Router();
var authRoute = require("./auth.routes");
var truelayerRoute = require("./apiv1/truelayer.routes");
var loanRoute = require("./apiv1/loan.routes");
var userSuperfiRoute = require("./apiv1/user.superfi.routes");
var userRewardRoute = require("./apiv1/user.reward.routes");
var klarnaRoute = require("./apiv1/klarna.routes");
var generalRoute = require("./apiv1/general.routes");

// General routes
router.use("/v1", require("./apiv1/general.routes"));
// User routes
router.use("/v1", require("./apiv1/apis.routes"));
// Admin routes
router.use("/admin", require("./apiv1/admin.routes"));

// Authentication routes
router.use("/", authRoute);

// Truelayer routes
router.use("/truelayer", truelayerRoute);

// User superfi routes
router.use("/user/superfi", userSuperfiRoute);

// Klarna routes
router.use("/klarna", klarnaRoute);

// User reward routes
router.use("/user/reward", userRewardRoute);

// General routes
router.use("/general", generalRoute);

// Loan routes
router.use("/loan", loanRoute);

// API Error routes
router.use(function (req, res) {
  return res.status(404).json({
    message: "Not found.",
  });
});

module.exports = router;
