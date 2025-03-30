var router = require("express").Router();
var truelayerController = require("../../controllers/truelayer.controller");
const auth = require("../../middleware/index");

router.get("/banks", auth.verifyToken, truelayerController.bankList);
router.get("/generate/bank-auth", auth.verifyToken, truelayerController.generateAuthDialogLink);

router.get("/exchange-code", truelayerController.authExchangeCode);

router.post("/user-bank/token", auth.verifyToken, truelayerController.authToken);

router.post("/user-bank/cards", auth.verifyToken, truelayerController.bankCards);
router.get("/user-bank/card-info", auth.verifyToken, truelayerController.cardInfo);
router.post("/user-bank/save/card-info", auth.verifyToken, truelayerController.saveCardInfo);

router.post("/user-bank/save/account-info", auth.verifyToken, truelayerController.saveAccountInfo);
router.get("/user-bank/account-info", auth.verifyToken, truelayerController.accountInfo);
// // Authentication to obtain a token

module.exports = router;
