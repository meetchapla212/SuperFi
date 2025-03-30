//const bcrypt = require("bcrypt");
var config = require("../../config/config");
const fs = require("fs");
const _ = require("lodash");
const { v4: uuidv4 } = require("uuid");
const responseHelper = require("../../common/responseHelper");
const firebaseHelper = require("../../common/firebase");
const utils = require("../../common/utils");
const DB = require("../../common/dbmanager");
const DBManager = new DB();
const validate = require("../../validations/admin.validation");
const moment = require("moment");
const monthFormat = "YYYY-MM";

module.exports = {
  // This function is used to get admin dashboard statistics data.
  getDashboardStats: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var dashboardStats = {
        totalDownloads: 0,
        totalSignups: 0,
        totalUsers: 0,
        totalActiveAccount: 0,
        totalActiveAccount30Days: 0,
        totalNewUser30Days: 0,
        totalUserTaskComplete: 0,
        NoOfActiveTasks: 0,
        totalRecommededUp: 0,
        totalRecommededDown: 0,
        totalCashback: 0,
        isSignupPause: false,
      };

      // Total Signups
      var resultData = await DBManager.getData("app_settings", "*", { setting_key: "total_app_downloads" });
      dashboardStats["totalDownloads"] = resultData?.rows?.[0]?.setting_value || 0;

      // Total Signups
      var sqlQry = `SELECT count(*) as total FROM users_master`;
      var resultData = await DBManager.runQuery(sqlQry);
      dashboardStats["totalSignups"] = resultData?.rows?.[0]?.["total"] || 0;

      // Total Users
      var resultData = await DBManager.countRecord("users_master", {});
      dashboardStats["totalUsers"] = resultData?.rows?.[0]?.["total"] || 0;

      // Total Active Users
      var resultData = await DBManager.countRecord("users_master", {
        status: "active",
      });
      dashboardStats["totalActiveAccount"] = resultData?.rows?.[0]?.["total"] || 0;

      // Total Active Users in last 30 days
      var sqlQry = `SELECT count(*) as total FROM users_master WHERE is_deleted = 0 AND last_login_date::date >= now() - interval '30 day'`;
      var resultData = await DBManager.runQuery(sqlQry);
      dashboardStats["totalActiveAccount30Days"] = resultData?.rows?.[0]?.["total"] || 0;

      // Total New Users in last 30 days
      var sqlQry = `SELECT count(*) as total FROM users_master WHERE is_deleted = 0 AND date_created::date >= now() - interval '30 day'`;
      var resultData = await DBManager.runQuery(sqlQry);
      dashboardStats["totalNewUser30Days"] = resultData?.rows?.[0]?.["total"] || 0;

      // No of rating
      var sqlQry = `SELECT superfi_rating FROM users_master WHERE is_deleted = 0 AND (superfi_rating = 0 OR superfi_rating = 1)`;
      var resultData = await DBManager.runQuery(sqlQry);
      var superfiRatings = resultData?.rows || [];
      var totalRatings = superfiRatings.length;
      if (totalRatings > 0) {
        var goodRatings = superfiRatings.filter((rating) => rating.superfi_rating == 1)?.length || 0;
        var badRatings = superfiRatings.filter((rating) => rating.superfi_rating == 0)?.length || 0;

        dashboardStats["totalRecommededUp"] = (goodRatings * 100) / totalRatings;
        dashboardStats["totalRecommededDown"] = (badRatings * 100) / totalRatings;
      }

      var isRegisterAllow = await DBManager.getKeyValue("app_settings", "setting_value", { setting_key: "new_register_allow" });
      dashboardStats["isSignupPause"] = isRegisterAllow === "0" ? true : false;

      var totalCashback = await DBManager.getKeyValue("app_settings", "setting_value", { setting_key: "cashback_reward_total_amount" });
      dashboardStats["totalCashback"] = totalCashback;

      var rewardTaskResult = await DBManager.getData("reward_task_master", "*", { is_active: 1 });
      dashboardStats["NoOfActiveTasks"] = rewardTaskResult?.rows?.length || 0;

      var rewardResult = await DBManager.getData("user_reward_master", "*", { is_completed: 1, month_name: moment().utc().format(monthFormat) });
      dashboardStats["totalUserTaskComplete"] = rewardResult?.rows?.length || 0;

      response = {
        status: true,
        message: "Success",
        data: dashboardStats,
      };

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to provide permission for pause / unpause signups.
  postSignUpAction: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { action } = apiData;
      await DBManager.dataUpdate("app_settings", { setting_value: action === "pause" ? "0" : "1" }, { setting_key: "new_register_allow" });

      response = {
        status: true,
        message: `Signup ${action} successfully!`,
      };

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to add / update cashback reward prize.
  updateCashbackPrize: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { amount } = apiData;
      var resultData = await DBManager.getData("app_settings", "*", { setting_key: "cashback_reward_total_amount" });
      var rowData = resultData?.rows || [];
      if (rowData && rowData.length) {
        if (rowData[0].setting_value == 0 && amount > 0) {
          var resultNotification =
            await DBManager.runQuery(`SELECT app_notification_token_master.*, users_master.user_preference_setting FROM app_notification_token_master
          LEFT JOIN users_master ON app_notification_token_master._user_id = users_master.user_id AND app_notification_token_master.is_deleted = users_master.is_deleted
          WHERE users_master.is_deleted = 0`);
          var rowNotification = resultNotification?.rows || [];
          rowNotification = _.filter(rowNotification, (row) => {
            if (
              row.user_preference_setting &&
              row.user_preference_setting.push_notification_preferences &&
              row.user_preference_setting.push_notification_preferences == 1
            ) {
              return row;
            }
          });
          if (rowNotification && rowNotification.length) {
            let resultRewards = await DBManager.countRecord("reward_task_master", { status: "active" });
            let rowRewards = resultRewards?.rows || [];
            let activeTasks = rowRewards?.[0]?.total || 0;
            let resultToken = rowNotification.map((row) => row.device_token);
            let messages = [
              {
                notification: {
                  title: "💰 SuperFi Prizepool is back!",
                  body: `Complete ${activeTasks} financial habit building tasks to win`,
                },
              },
            ];
            // Send Notification
            firebaseHelper.sendNotification(resultToken, messages);
          }
        }
      }

      await DBManager.dataUpdate("app_settings", { setting_value: amount || 0 }, { setting_key: "cashback_reward_total_amount" });

      response = {
        status: true,
        message: `Amount saved successfully!`,
      };

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
};
