var router = require("express").Router();
const loanController = require("../../controllers/loan.controller");
const auth = require("../../middleware/index");

router.get("/banks", auth.verifyToken, loanController.bankList);
router.get("/transaction", auth.verifyToken, loanController.providerTransaction);

module.exports = router;
