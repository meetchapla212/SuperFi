var router = require("express").Router();
const userSuperfiController = require("../../controllers/user.superfi.controller");
const auth = require("../../middleware/index");

router.post("/calculation-method", auth.verifyToken, userSuperfiController.calculationMethod);
router.get("/dashboard-info", auth.verifyToken, userSuperfiController.dashboardInfo);
router.get("/all-accounts", auth.verifyToken, userSuperfiController.allCardsAccountsInfo);
router.post("/mark-repayment", auth.verifyToken, userSuperfiController.markRepayment);
router.get("/account-details", auth.verifyToken, userSuperfiController.accountDetails);
router.post("/update/pay-amount", auth.verifyToken, userSuperfiController.payAmountUpdate);
router.post("/update/payment-due-date", auth.verifyToken, userSuperfiController.paymentDueDateUpdate);
router.post("/update/minimum-repayment", auth.verifyToken, userSuperfiController.minimumRepaymentUpdate);
router.post("/update/interest-rate", auth.verifyToken, userSuperfiController.interestRateUpdate);
router.post("/add/cards-overdraft", auth.verifyToken, userSuperfiController.addCreditOverdraftAccounts);
router.get("/verify-url", userSuperfiController.generateVerifyUrl);
router.post("/account/delete", auth.verifyToken, userSuperfiController.deleteAccount);
router.post("/update/account-limit", auth.verifyToken, userSuperfiController.accountLimitUpdate);
router.post("/update/balance", auth.verifyToken, userSuperfiController.updateAccountBalance);
router.get("/income-expenditure-details", auth.verifyToken, userSuperfiController.incomeAndExpenditureDetails);

module.exports = router;
