var router = require("express").Router();
var usersController = require("./../controllers/users.controller");
const auth = require("../middleware/index");

router.post(
  "/auth/check/email",
  auth.verifyApiKey,
  usersController.checkUserEmail
);
router.get("/auth/verify-email", usersController.verifyUserEmail);
router.post("/auth/register", auth.verifyApiKey, usersController.registerUser);
router.post("/auth/login", auth.verifyApiKey, usersController.loginUser);
router.post(
  "/auth/onboarding",
  auth.verifyApiKey,
  usersController.saveOnboardingProgress
);
router.get(
  "/auth/onboarding",
  auth.verifyApiKey,
  usersController.getOnboardingProgress
);
router.post(
  "/auth/forgot-passcode",
  auth.verifyApiKey,
  usersController.forgotPasscode
);
router.post(
  "/auth/logout",
  [auth.verifyToken],
  usersController.logoutUser
);

// // Authentication to obtain a token

module.exports = router;
