var router = require("express").Router();
const userCronController = require("../../controllers/user.cron.controller");
const userController = require("../../controllers/users.controller");

// with out auth provider list data

router.get("/cron-reward-status-update", userCronController.rewardStatusUpdate);
router.get("/cron-reward-prize-distribute", userCronController.rewardPrizeDistribute);
router.get("/cron-debt-recalculation-update", userCronController.debtReCalculation);

router.get("/cron-due-notification", userCronController.sendDueNotification);
router.get("/cron-active-reward", userCronController.activeRandomRewards);
router.get("/update/downloads", userController.updateTotalDownloads);

module.exports = router;
