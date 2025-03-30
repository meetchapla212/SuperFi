const responseHelper = require("../../common/responseHelper");
const DB = require("../../common/dbmanager");
const DBManager = new DB();

module.exports = {
  // This function is used to get all reward tasks.
  getAllRewards: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var sqlQry = `SELECT * FROM reward_task_master WHERE is_deleted = 0 ORDER BY reward_task_id ASC`;
      var resultReward = await DBManager.runQuery(sqlQry);
      var rowReward = resultReward?.rows || [];

      response = {
        status: true,
        message: "Success",
        data: rowReward,
      };

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used active /deactive reward tasks.
  rewardAction: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { action } = req.body;
      const { reward_task_id } = req.params;

      if (!action || !reward_task_id) {
        response.message = "Invalid request";
        return responseHelper.respondSuccess(res, 200, response);
      }

      if (action == "active") {
        await DBManager.dataUpdate("reward_task_master", { status: "schedule active" }, { reward_task_id: reward_task_id });
        response = {
          status: true,
          message: "Reward activated successfully.",
        };
      } else if (action == "deactive") {
        await DBManager.dataUpdate("reward_task_master", { status: "schedule deactive" }, { reward_task_id: reward_task_id });
        response = {
          status: true,
          message: "Reward deactivated successfully.",
        };
      }

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
};
