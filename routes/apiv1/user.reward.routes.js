var router = require("express").Router();
const rewardController = require("../../controllers/user.reward.controller");
const auth = require("../../middleware/index");

router.get("/reward-info", auth.verifyToken, rewardController.cardRewardInfo);
router.post("/update/completed_reward", auth.verifyToken, rewardController.updateCompletedReward);
router.post("/update/reward_cashback_account", auth.verifyToken, rewardController.saveRewardCashbackAccount);

module.exports = router;
