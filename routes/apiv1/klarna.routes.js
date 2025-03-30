var router = require("express").Router();
const klarnaController = require("../../controllers/klarna.controller");
const auth = require("../../middleware/index");

router.post("/save/klarna-info", auth.verifyToken, klarnaController.saveCustomKlarnaInfo);
router.get("/klarna-info", auth.verifyToken, klarnaController.klarnaInfo);
router.get("/user/transaction", auth.verifyToken, klarnaController.klarnaTransaction);
router.post("/update/installments", auth.verifyToken, klarnaController.updateCompletedInstallments);

module.exports = router;
