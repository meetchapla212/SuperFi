const validate = require("../validations/user.reward.validation");
const responseHelper = require("./../common/responseHelper");
const rewardHelper = require("./../common/reward");
const superfiHelper = require("./../common/superfi");
const DB = require("./../common/dbmanager");
const DBManager = new DB();
const _ = require("lodash");
const moment = require("moment");
const monthFormat = "YYYY-MM";

module.exports = {
  // This function is used to get users reward task details.
  cardRewardInfo: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.query;
      const { userId } = req.user;

      await superfiHelper.updateScreenVisitDate("cashback_last_visit_date", userId);

      // Truelayer accounts connected reward check
      await rewardHelper.checkReward(userId, "all_truelayer_accounts_connected");
      // Superfi rated reward check
      var resultUser = await DBManager.runQuery(
        `SELECT * FROM users_master WHERE user_id = '${userId}' AND (superfi_rating = 0 OR superfi_rating = 1) and is_deleted = 0`
      );
      var rowUser = resultUser?.rows || [];
      if (rowUser && rowUser.length) {
        await rewardHelper.checkReward(userId, "rate_superfi");
      }

      // User reward info.
      var userRewardResult = await DBManager.getData("user_reward_master", "reward_info, month_name, is_completed", {
        _user_id: userId,
        month_name: `${moment(new Date()).format(monthFormat)}`,
      });
      var userRewardRow = userRewardResult?.rows || [];
      if (userRewardRow && userRewardRow.length) {
        var rewardInfo = userRewardRow[0].reward_info;
        if (rewardInfo) {
          var rewardTasks = rewardInfo?.tasks || {};
          if (rewardTasks) {
            // Reward cashback prize.
            var resultRewardPrize = await DBManager.getData("app_settings", "setting_value", { setting_key: "cashback_reward_total_amount" });
            var rowRewardPrize = resultRewardPrize?.rows || [];
            // User on track to get reward prize.
            var userOnRewardTrack = await DBManager.runQuery(
              `select count(user_reward_id) as total_user, (select count(user_reward_id) from user_reward_master where is_completed = 1 and month_name = '${moment(
                new Date()
              ).format(monthFormat)}' and is_deleted = 0) as completed_task_user from user_reward_master where month_name = '${moment(
                new Date()
              ).format(monthFormat)}' and is_deleted = 0`
            );

            var resultRewardAccount = await DBManager.getData("user_reward_cashback_account", "user_reward_cashback_account_id", {
              _user_id: userId,
            });
            var rowRewardAccount = resultRewardAccount?.rows || [];
            var rewardResponse = {
              tasks: rewardTasks,
              monthly_prize_pool: rowRewardPrize && rowRewardPrize.length ? rowRewardPrize?.[0]?.setting_value : "",
              user_on_reward_track: userOnRewardTrack?.rows?.[0]?.total_user,
              completed_task_user: userOnRewardTrack?.rows?.[0]?.completed_task_user,
              is_all_reward_task_completed: rewardInfo?.[0]?.is_completed,
              is_cashback_account_selected: rowRewardAccount && rowRewardAccount.length ? true : false,
            };
            rewardResponse.estimated_distributed_amount =
              rewardResponse.completed_task_user != 0 ? rewardResponse.monthly_prize_pool / rewardResponse.completed_task_user : "";
            await Promise.all(
              rewardResponse.tasks.map(async (rewardTask) => {
                // Reward tasks.
                var taskResult = await DBManager.getData("reward_task_master", "task_name", { reward_task_id: rewardTask.reward_task_id });
                var taskRow = taskResult?.rows || [];
                if (taskRow && taskRow.length) {
                  rewardTask.task_name = taskRow?.[0]?.task_name || "";
                }
              })
            ).then(async () => {
              response.data = rewardResponse;
              response.message = "Card Reward Info Tasks Listed Successfully.";
              return responseHelper.respondSuccess(res, 200, response);
            });
          } else {
            response.status = true;
            response.message = "Card reward tasks not found.";
            return responseHelper.respondSuccess(res, 200, response);
          }
        } else {
          response.status = true;
          response.message = "Reward info not found.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        response.status = true;
        response.message = "Reward info not found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update users completed reward task.
  updateCompletedReward: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { userId } = req.user;
      if (apiData.reward_task_name == "check_credit_score") {
        await superfiHelper.updateScreenVisitDate("credit_score_last_visit_date", userId);
      }
      await validate.checkRewardName(apiData);
      await rewardHelper.checkReward(userId, apiData.reward_task_name);
      response.status = true;
      response.message = "Updated Completed Reward.";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to save users overdraft account for reward cashback.
  saveRewardCashbackAccount: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { userId } = req.user;
      await validate.checkOverdraftAccountId(apiData);
      var resultRewardAccount = await DBManager.getData("user_reward_cashback_account", "user_reward_cashback_account_id", { _user_id: userId });
      var rowRewardAccount = resultRewardAccount?.rows || [];
      if (rowRewardAccount && rowRewardAccount.length) {
        await DBManager.dataUpdate(
          "user_reward_cashback_account",
          { user_overdraft_account_id: apiData.user_overdraft_account_id },
          { _user_id: userId }
        );
      } else {
        let dataInsert = {
          _user_id: userId,
          user_overdraft_account_id: apiData.user_overdraft_account_id,
        };
        await DBManager.dataInsert("user_reward_cashback_account", dataInsert);
      }
      response.status = true;
      response.message = "Updated Reward Cashback Account.";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
};
