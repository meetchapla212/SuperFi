var router = require("express").Router();
var responseHelper = require("../../common/responseHelper");
var config = require("./../../config/config");
var adminAuthController = require("../../controllers/admin/admin.auth.controller");
var adminDashboardController = require("../../controllers/admin/admin.dashboard.controller");
var adminUserController = require("../../controllers/admin/admin.user.controller");
var adminCatalogController = require("../../controllers/admin/admin.catalog.controller");
var adminRewardController = require("../../controllers/admin/admin.reward.controller");
const auth = require("../../middleware/index");
const adminAccountController = require("../../controllers/admin/admin.account.controller");

var multer = require("multer");
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, `${__dirname}/../../uploads`);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    var fileName = file.originalname.replace(/\s/g, "-");
    cb(null, uniqueSuffix + "-" + fileName);
  },
});

var upload = multer({ storage: storage });

router.post("/login", adminAuthController.loginAdmin);
router.post("/forgot-password", adminAuthController.forgotPassword);
router.get("/check", [auth.verifyAdminToken], adminAuthController.getAdminProfile);
router.get("/dashboard/stats", [auth.verifyAdminToken], adminDashboardController.getDashboardStats);
router.post("/dashboard/signup-action", [auth.verifyAdminToken], adminDashboardController.postSignUpAction);
router.post("/dashboard/reward-cashback", [auth.verifyAdminToken], adminDashboardController.updateCashbackPrize);

router.get("/admins", [auth.verifyAdminToken], adminAccountController.getAllAdmins);

router.post("/admins/add", [auth.verifyAdminToken], adminAccountController.createNewAdminUser);
router.post("/admins/:adminId/update", [auth.verifyAdminToken], adminAccountController.updateAdminUser);
router.post("/admins/:adminId/delete", [auth.verifyAdminToken], adminAccountController.deleteAdminUser);

router.get("/users", [auth.verifyAdminToken], adminUserController.getAllUsers);
router.post("/user/:userId/action", [auth.verifyAdminToken], adminUserController.userAction);
router.get("/user/:userId/live/view", [auth.verifyAdminToken], adminUserController.viewUserTruelayerDetails);
router.get("/user/:userId/view", [auth.verifyAdminToken], adminUserController.viewUserDetails);

router.get("/card-catalog", [auth.verifyAdminToken], adminCatalogController.getAllCards);
router.post("/card-catalog/:cardId/action", [auth.verifyAdminToken, upload.single("file")], adminCatalogController.cardAction);

router.get("/rewards", [auth.verifyAdminToken], adminRewardController.getAllRewards);
router.post("/reward-action", [auth.verifyAdminToken], adminRewardController.rewardAction);
router.get("/user/completed-reward", [auth.verifyAdminToken], adminUserController.userCompletedReward);
router.post("/user/:userId/send-reward", [auth.verifyAdminToken], adminUserController.sendUserReward);

module.exports = router;
