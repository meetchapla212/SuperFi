//const bcrypt = require("bcrypt");
var config = require("../../config/config");
const fs = require("fs");
const _ = require("lodash");
const { v4: uuidv4 } = require("uuid");
const responseHelper = require("../../common/responseHelper");
const axios = require("axios").default;
const truelayerHelper = require("../../common/truelayer");
const firebaseHelper = require("../../common/firebase");
const utils = require("../../common/utils");
const DB = require("../../common/dbmanager");
const DBManager = new DB();
const validate = require("../../validations/admin.validation");
const moment = require("moment");
const monthFormat = "YYYY-MM";
const dateFormat = "YYYY-MM-DD HH:mm:ss";

module.exports = {
  // This function is used to get all users.
  getAllUsers: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var sqlQry = `SELECT * FROM users_master WHERE is_deleted = 0 ORDER BY user_unique_id DESC`;
      var results = await DBManager.runQuery(sqlQry);
      var rows = results?.rows || [];

      response = {
        status: true,
        message: "Success",
        data: rows,
      };

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get users details.
  viewUserDetails: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { userId } = req.params;
      var userInfo = {};

      var result = await DBManager.getData("users_master", "*", {
        user_id: userId,
      });
      var userData = result?.rows?.[0] || {};
      userInfo["info"] = userData;

      var result = await DBManager.getData("user_onboarding_progress_master", "*", {
        email_id: userData["u_email_id"],
      });
      var userOnboard = result?.rows?.[0] || {};
      userInfo["onboarding"] = userOnboard;
      var userProgress = userOnboard?.user_progress || {};
      userInfo["features"] = {
        onboarding: userProgress["step_9"] ? "Completed" : "In progress",
      };

      var resultScreenVisit = await DBManager.getData("users_screen_last_visit", "*", { _user_id: userId });
      var rowScreenVisit = resultScreenVisit?.rows || [];
      userInfo["features"].debt_calculator = rowScreenVisit?.[0]?.debt_calculator_last_visit_date || "";
      userInfo["features"].credit_score = rowScreenVisit?.[0]?.credit_score_last_visit_date || "";
      userInfo["features"].cashback = rowScreenVisit?.[0]?.cashback_last_visit_date || "";

      var resultRewardAccount = await DBManager.getData("user_reward_cashback_account", "user_reward_cashback_account_id", {
        _user_id: userId,
      });
      var rowRewardAccount = resultRewardAccount?.rows || [];
      userInfo["features"].cashback_setup = rowRewardAccount.length ? "yes" : "no";

      var resultReward = await DBManager.getData("user_reward_master", "*", { _user_id: userId, month_name: moment().utc().format(monthFormat) });
      var rowReward = resultReward?.rows || [];
      var rewardInfo = rowReward?.[0]?.reward_info?.tasks || [];
      var completedTask = _.filter(rewardInfo, { complete: true });
      userInfo["features"].tasks = {
        total_tasks: rewardInfo.length || 0,
        completed_tasks: completedTask.length || 0,
      };
      userInfo["features"].cashback_earned = rowReward?.[0]?.win_reward_amount || 0;

      var resultDebtCalculation = await DBManager.runQuery(
        `SELECT * FROM superfi_user_debt_record_master WHERE _user_id = '${userId}' ORDER BY date_modified DESC`
      );
      var rowDebtCalculation = resultDebtCalculation?.rows || [];
      userInfo["features"].leftover_money =
        rowDebtCalculation?.[0]?.superfi_debt_calculation_details?.avalanche?.pay_amount ||
        rowDebtCalculation?.[0]?.superfi_debt_calculation_details?.snowball?.pay_amount ||
        0;
      /************************************* Credit Cards *******************************/
      var result = await DBManager.runQuery(
        `SELECT user_card_master.*, is_token_expired FROM user_card_master LEFT JOIN user_bank_account_master ON user_card_master._user_id = user_bank_account_master._user_id AND user_card_master._bank_id = user_bank_account_master._bank_id WHERE user_card_master._user_id = '${userId}'  AND user_card_master.is_deleted = 0`
      );

      var userCardInfo = result?.rows || [];
      if (userCardInfo && userCardInfo.length) {
        await Promise.all(
          userCardInfo.map(async (card) => {
            card.card_details = utils.decryptData(card.card_details);
          })
        );
      }
      userInfo["credit_cards"] = userCardInfo;

      /************************************* Overdraft Accounts *******************************/
      var result = await DBManager.runQuery(
        `SELECT user_overdraft_account_master.*, is_token_expired FROM user_overdraft_account_master LEFT JOIN user_bank_account_master ON user_overdraft_account_master._user_id = user_bank_account_master._user_id AND user_overdraft_account_master._bank_id = user_bank_account_master._bank_id WHERE user_overdraft_account_master._user_id = '${userId}'  AND user_overdraft_account_master.is_deleted = 0`
      );

      var userOverdraftAccountInfo = result?.rows || [];
      if (userOverdraftAccountInfo && userOverdraftAccountInfo.length) {
        await Promise.all(
          userOverdraftAccountInfo.map(async (account) => {
            account.account_details = utils.decryptData(account.account_details);
          })
        );
      }
      userInfo["overdraft_account"] = userOverdraftAccountInfo;

      /************************************* Klarna Accounts *******************************/

      var result = await DBManager.runQuery(
        `SELECT klarna_id, bnpl_id, bnpl_name, interest_rate, fix_amount, klarna_id, price_of_purchase, payment_schedule, date_of_purchase, payment_installments_details FROM user_klarna_account_master LEFT JOIN bnpl_provider_master ON user_klarna_account_master._bnpl_id = bnpl_provider_master.bnpl_id AND user_klarna_account_master.is_deleted = bnpl_provider_master.is_deleted WHERE _user_id = '${userId}' AND user_klarna_account_master.is_deleted = 0`
      );
      userInfo["klarna_account"] = [];

      var rowklarnaAccounts = result?.rows || [];
      if (rowklarnaAccounts && rowklarnaAccounts.length) {
        await Promise.all(
          rowklarnaAccounts.map(async (klarnaAccount) => {
            if (klarnaAccount.payment_schedule == "Pay in 30 days") {
              let estimatedDueDate = moment(klarnaAccount.date_of_purchase, dateFormat).utc().add(30, "d");
              let currentDate = moment().utc().format(dateFormat);
              if (
                !klarnaAccount?.payment_installments_details?.payment_completed ||
                (currentDate <= estimatedDueDate && currentDate >= klarnaAccount.date_of_purchase)
              ) {
                if (!_.filter(userInfo["klarna_account"], { klarna_id: klarnaAccount.klarna_id }).length) {
                  userInfo["klarna_account"].push(klarnaAccount);
                }
              }
            } else if (klarnaAccount.payment_schedule == "Pay in 3 installments") {
              let currentMonth = moment().utc().format(monthFormat);
              await Promise.all(
                klarnaAccount.installments.map(async (row) => {
                  if (!row.completed || moment(row.installments_date).format(monthFormat) == currentMonth) {
                    if (!_.filter(userInfo["klarna_account"], { klarna_id: klarnaAccount.klarna_id }).length) {
                      userInfo["klarna_account"].push(klarnaAccount);
                    }
                  }
                })
              );
            }
          })
        );
      }

      response = {
        status: true,
        message: "Success",
        data: userInfo,
      };

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get users live accounts details.
  viewUserTruelayerDetails: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { userId } = req.params;
      var userInfo = {};

      var result = await DBManager.getData("users_master", "*", {
        user_id: userId,
      });
      var userData = result?.rows?.[0] || {};
      userInfo["info"] = userData;

      var result = await DBManager.getData("user_onboarding_progress_master", "*", {
        email_id: userData["u_email_id"],
      });
      var userOnboard = result?.rows?.[0] || {};
      userInfo["onboarding"] = userOnboard;
      var userProgress = userOnboard?.user_progress || {};
      userInfo["features"] = {
        onboarding: userProgress["step_9"] ? "Completed" : "In progress",
      };

      var resultScreenVisit = await DBManager.getData("users_screen_last_visit", "*", { _user_id: userId });
      var rowScreenVisit = resultScreenVisit?.rows || [];
      userInfo["features"].debt_calculator = rowScreenVisit?.[0]?.debt_calculator_last_visit_date || "";
      userInfo["features"].credit_score = rowScreenVisit?.[0]?.credit_score_last_visit_date || "";
      userInfo["features"].cashback = rowScreenVisit?.[0]?.cashback_last_visit_date || "";

      var resultRewardAccount = await DBManager.getData("user_reward_cashback_account", "user_reward_cashback_account_id", {
        _user_id: userId,
      });
      var rowRewardAccount = resultRewardAccount?.rows || [];
      userInfo["features"].cashback_setup = rowRewardAccount.length ? "yes" : "no";

      var resultReward = await DBManager.getData("user_reward_master", "*", { _user_id: userId, month_name: moment().utc().format(monthFormat) });
      var rowReward = resultReward?.rows || [];
      var rewardInfo = rowReward?.[0]?.reward_info?.tasks || [];
      var completedTask = _.filter(rewardInfo, { complete: true });
      userInfo["features"].tasks = {
        total_tasks: rewardInfo.length || 0,
        completed_tasks: completedTask.length || 0,
      };
      userInfo["features"].cashback_earned = rowReward?.[0]?.win_reward_amount || 0;

      var resultDebtCalculation = await DBManager.runQuery(
        `SELECT * FROM superfi_user_debt_record_master WHERE _user_id = '${userId}' ORDER BY date_modified DESC`
      );
      var rowDebtCalculation = resultDebtCalculation?.rows || [];
      userInfo["features"].leftover_money =
        rowDebtCalculation?.[0]?.superfi_debt_calculation_details?.avalanche?.pay_amount ||
        rowDebtCalculation?.[0]?.superfi_debt_calculation_details?.snowball?.pay_amount ||
        0;

      /************************************* Credit Cards *******************************/
      var resultUserCards =
        await DBManager.runQuery(`SELECT user_card_master.*, is_token_expired FROM user_card_master LEFT JOIN bank_master ON user_card_master._bank_id = bank_master.bank_id 
      LEFT JOIN user_bank_account_master ON user_card_master._user_id = user_bank_account_master._user_id AND user_card_master._bank_id = user_bank_account_master._bank_id WHERE user_card_master._user_id = '${userId}' AND user_card_master.is_deleted = 0`);
      // var result = await DBManager.runQuery(`SELECT user_card_master.*, is_token_expired FROM user_card_master LEFT JOIN user_bank_account_master ON user_card_master._user_id = user_bank_account_master._user_id AND user_card_master._bank_id = user_bank_account_master._bank_id WHERE user_card_master._user_id = '${userId}'`);
      var rowUserCards = resultUserCards?.rows || [];
      if (rowUserCards && rowUserCards.length) {
        var rowBankId = await _.uniqBy(rowUserCards, "_bank_id");
        await Promise.all(
          rowBankId.map(async (rowId) => {
            // Generate truelayer access token.
            let data = {
              user: { userId: userId },
              body: { bank_id: rowId._bank_id },
            };
            var tokens = await truelayerHelper.generateTruelayerToken(data);
            return { bank_id: rowId._bank_id, token: tokens };
          })
        ).then(async (tokens) => {
          await Promise.all(
            rowUserCards.map(async (rowData) => {
              var resultToken = await _.find(tokens, { bank_id: rowData._bank_id });
              resultToken = resultToken.token;
              var rowToken = resultToken?.data || [];
              rowData.card_details = utils.decryptData(rowData.card_details);
              if (resultToken.status) {
                // List user bank card.
                try {
                  var resultCard = await axios.request({
                    method: "get",
                    url: `${config.TRUELAYER_API_BASE_URL}/data/v1/cards/${rowData.truelayer_card_id}`,
                    headers: { Authorization: `Bearer ${rowToken.access_token}` },
                  });
                } catch (error) {
                  if (error.message == "Request failed with status code 404") {
                    await DBManager.dataDelete("user_card_master", { user_card_id: rowData.user_card_id });
                    rowUserCards = rowUserCards.filter((element) => {
                      if (element.user_card_id != rowData.user_card_id) {
                        return true;
                      }
                      return false;
                    });
                    return;
                  }
                }

                var rowCard = resultCard?.data?.results || [];
                if (rowCard && rowCard.length) {
                  // rowData.card_details = utils.decryptData(rowData.card_details);
                  var responseData = rowData;

                  // List user bank card balance.
                  var resultCardBalance = await axios.request({
                    method: "get",
                    url: `${config.TRUELAYER_API_BASE_URL}/data/v1/cards/${rowData.truelayer_card_id}/balance`,
                    headers: { Authorization: `Bearer ${rowToken.access_token}` },
                  });
                  var rowCardBalance = resultCardBalance?.data?.results || [];
                  if (rowCardBalance && rowCardBalance.length) {
                    responseData.card_details.available_balance = rowCardBalance?.[0].available;
                    responseData.card_details.current_balance = rowCardBalance?.[0].current;
                    responseData.card_details.credit_limit = rowCardBalance?.[0].credit_limit;
                    responseData.card_details.minimum_repayment =
                      +rowData?.card_details?.updated_minimum_repayment ||
                      utils.createMinimumRepayment(
                        Math.abs(rowCardBalance?.[0]?.current),
                        responseData?.card_details?.updated_interest_rate ||
                          responseData?.card_details?.custom_interest_rate ||
                          responseData?.card_details?.interest_rate
                      );
                  }
                }
              }
            })
          ).then(() => {
            userInfo["credit_cards"] = rowUserCards;
          });
        });
      } else {
        userInfo["credit_cards"] = rowUserCards;
      }

      /************************************* Overdraft Accounts *******************************/
      // var result = await DBManager.runQuery(`SELECT user_overdraft_account_master.*, is_token_expired FROM user_overdraft_account_master LEFT JOIN user_bank_account_master ON user_overdraft_account_master._user_id = user_bank_account_master._user_id AND user_overdraft_account_master._bank_id = user_bank_account_master._bank_id WHERE user_overdraft_account_master._user_id = '${userId}'`);

      var resultUserAccounts =
        await DBManager.runQuery(`SELECT user_overdraft_account_master.*, is_token_expired , overdraft_catalog_master.interest_rate as catalog_interest_rate, logo_url FROM user_overdraft_account_master 
      LEFT JOIN overdraft_catalog_master ON user_overdraft_account_master._bank_id = overdraft_catalog_master._bank_id 
      LEFT JOIN bank_master ON user_overdraft_account_master._bank_id = bank_master.bank_id
      LEFT JOIN user_bank_account_master ON user_overdraft_account_master._user_id = user_bank_account_master._user_id AND user_overdraft_account_master._bank_id = user_bank_account_master._bank_id WHERE user_overdraft_account_master._user_id = '${userId}' AND user_overdraft_account_master.is_deleted = 0`);
      var rowUserAccounts = resultUserAccounts?.rows || [];
      if (rowUserAccounts && rowUserAccounts.length) {
        var rowBankId = await _.uniqBy(rowUserAccounts, "_bank_id");
        await Promise.all(
          rowBankId.map(async (rowId) => {
            // Generate truelayer access token and refresh token.
            let data = {
              user: { userId: userId },
              body: { bank_id: rowId._bank_id },
            };
            var tokens = await truelayerHelper.generateTruelayerToken(data);
            return { bank_id: rowId._bank_id, token: tokens };
          })
        ).then(async (tokens) => {
          await Promise.all(
            rowUserAccounts.map(async (rowData) => {
              var resultToken = await _.find(tokens, { bank_id: rowData._bank_id });
              resultToken = resultToken.token;
              var rowToken = resultToken?.data || [];
              rowData.account_details = utils.decryptData(rowData.account_details);
              if (resultToken.status) {
                // List users bank accounts.
                try {
                  var resultAccount = await axios.request({
                    method: "get",
                    url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts/${rowData.truelayer_account_id}`,
                    headers: { Authorization: `Bearer ${rowToken.access_token}` },
                  });
                } catch (error) {
                  if (error.message == "Request failed with status code 404") {
                    await DBManager.dataDelete("user_overdraft_account_master", { user_overdraft_account_id: rowData.user_overdraft_account_id });
                    rowUserAccounts = rowUserAccounts.filter((element) => {
                      if (element.user_overdraft_account_id != rowData.user_overdraft_account_id) {
                        return true;
                      }
                      return false;
                    });
                    return;
                  }
                }

                var rowAccount = resultAccount?.data?.results || [];
                if (rowAccount && rowAccount.length) {
                  // rowData.account_details = utils.decryptData(rowData.account_details);
                  var responseData = rowData;
                  // List users bank accounts balance.
                  var resultBalance = await axios.request({
                    method: "get",
                    url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts/${rowData.truelayer_account_id}/balance`,
                    headers: { Authorization: `Bearer ${rowToken.access_token}` },
                  });
                  var rowBalance = resultBalance?.data?.results || [];
                  if (rowBalance && rowBalance.length) {
                    responseData.account_details.balance_info = rowBalance?.[0];
                    responseData.minimum_repayment = utils.createMinimumRepayment(Math.abs(rowBalance?.[0]?.overdraft), responseData?.interest_rate);
                  }
                }
              }
            })
          ).then(() => {
            userInfo["overdraft_account"] = rowUserAccounts;
          });
        });
      } else {
        userInfo["overdraft_account"] = rowUserAccounts;
      }

      /************************************* Klarna Accounts *******************************/

      var result = await DBManager.runQuery(
        `SELECT klarna_id, bnpl_id, bnpl_name, interest_rate, fix_amount, klarna_id, price_of_purchase, payment_schedule, date_of_purchase, payment_installments_details FROM user_klarna_account_master LEFT JOIN bnpl_provider_master ON user_klarna_account_master._bnpl_id = bnpl_provider_master.bnpl_id AND user_klarna_account_master.is_deleted = bnpl_provider_master.is_deleted WHERE _user_id = '${userId}' AND user_klarna_account_master.is_deleted = 0`
      );
      userInfo["klarna_account"] = [];

      var rowklarnaAccounts = result?.rows || [];
      if (rowklarnaAccounts && rowklarnaAccounts.length) {
        await Promise.all(
          rowklarnaAccounts.map(async (klarnaAccount) => {
            if (klarnaAccount.payment_schedule == "Pay in 30 days") {
              let estimatedDueDate = moment(klarnaAccount.date_of_purchase, dateFormat).utc().add(30, "d");
              let currentDate = moment().utc().format(dateFormat);
              if (
                !klarnaAccount.payment_installments_details.payment_completed ||
                (currentDate <= estimatedDueDate && currentDate >= klarnaAccount.date_of_purchase)
              ) {
                if (!_.filter(userInfo["klarna_account"], { klarna_id: klarnaAccount.klarna_id }).length) {
                  userInfo["klarna_account"].push(klarnaAccount);
                }
              }
            } else if (klarnaAccount.payment_schedule == "Pay in 3 installments") {
              let currentMonth = moment().utc().format(monthFormat);
              await Promise.all(
                klarnaAccount.installments.map(async (row) => {
                  if (!row.completed || moment(row.installments_date).format(monthFormat) == currentMonth) {
                    if (!_.filter(userInfo["klarna_account"], { klarna_id: klarnaAccount.klarna_id }).length) {
                      userInfo["klarna_account"].push(klarnaAccount);
                    }
                  }
                })
              );
            }
          })
        );
      }

      response = {
        status: true,
        message: "Success",
        data: userInfo,
      };

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to pause / unpause user from login and to delete user.
  userAction: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { action } = req.body;
      const { userId } = req.params;

      if (!action || !userId) {
        response.message = "Invalid request";
        return responseHelper.respondSuccess(res, 200, response);
      }

      if (action == "delete") {
        var resultUser = await DBManager.getData("users_master", "*", {
          user_id: userId,
        });
        var rowUser = resultUser?.rows?.[0] || {};

        var sqlDeleteQry = `UPDATE users_master SET is_deleted = '1', status = 'delete' WHERE user_id = '${userId}'`;
        await DBManager.runQuery(sqlDeleteQry);

        var sqlDeleteTokenQry = `UPDATE app_notification_token_master SET is_deleted = '1' WHERE _user_id = '${userId}'`;
        await DBManager.runQuery(sqlDeleteTokenQry);

        if (rowUser && rowUser.u_email_id) {
          var userEmailId = rowUser.u_email_id;
          var sqlDeleteRecordQry = `DELETE FROM user_onboarding_progress_master WHERE email_id = '${userEmailId}'`;
          await DBManager.runQuery(sqlDeleteRecordQry);
        }

        response = {
          status: true,
          message: "User deleted successfully!",
        };
        return responseHelper.respondSuccess(res, 200, response);
      } else if (action == "Unpause") {
        var sqlQry = `UPDATE users_master SET status = 'active' WHERE user_id = '${userId}'`;
        await DBManager.runQuery(sqlQry);

        response = {
          status: true,
          message: "User unpaused successfully!",
        };
        return responseHelper.respondSuccess(res, 200, response);
      } else if (action == "Pause") {
        var sqlQry = `UPDATE users_master SET status = 'pause' WHERE user_id = '${userId}'`;
        await DBManager.runQuery(sqlQry);

        response = {
          status: true,
          message: "User pause successfully!",
        };
        return responseHelper.respondSuccess(res, 200, response);
      }

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update user for all reward tasks completetion.
  userCompletedReward: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var resultCompletedReward = await DBManager.getData("user_reward_master", "_user_id", {
        month_name: `${moment().utc().format(monthFormat)}`,
        is_completed: 1,
      });
      var rowCompletedReward = resultCompletedReward?.rows || [];
      var responseData = [];
      await Promise.all(
        rowCompletedReward.map(async (rowData) => {
          var resultAccountSelected = await DBManager.getData("user_reward_cashback_account", "*", {
            _user_id: rowData._user_id,
          });
          var rowAccountSelected = resultAccountSelected?.rows || [];
          if (rowAccountSelected && rowAccountSelected.length) {
            var resultUserDetails = await DBManager.getData("users_master", "*", {
              user_id: rowData._user_id,
            });
            var rowUserDetails = resultUserDetails?.rows || [];
            if (rowUserDetails && rowUserDetails.length) {
              rowData.email_id = rowUserDetails?.[0]?.u_email_id || "";
              rowData.user_unique_id = rowUserDetails?.[0]?.user_unique_id || "";
            }

            var resultTotalTasks = await DBManager.getData("reward_task_master", "*", {
              is_active: 1,
            });
            rowData.total_tasks = resultTotalTasks?.rows?.length || 0;

            var resultAccountDetail = await DBManager.getData("user_overdraft_account_master", "*", {
              user_overdraft_account_id: rowAccountSelected?.[0]?.user_overdraft_account_id,
            });
            var rowAccountDetail = resultAccountDetail?.rows || [];
            if (rowAccountDetail && rowAccountDetail.length) {
              let decryptAccountDetails = utils.decryptData(rowAccountDetail[0].account_details);
              rowData.account_number = decryptAccountDetails.account_number || {};
            }

            rowData.winner = "yes";
            responseData.push(rowData);
          }
        })
      );
      response = {
        status: true,
        message: "Success",
        data: responseData,
      };
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to send reward notification to user who has completed all reward tasks.
  sendUserReward: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { userId } = req.params;
      if (!userId) {
        response.message = "Invalid request";
        return responseHelper.respondSuccess(res, 200, response);
      }
      var cashbackPrize = await DBManager.getKeyValue("app_settings", "setting_value", {
        setting_key: "cashback_reward_total_amount",
      });
      if (cashbackPrize) {
        await DBManager.dataUpdate(
          "user_reward_master",
          {
            win_reward_amount: cashbackPrize,
            reward_credit_date: `${moment().utc().format(dateFormat)}`,
          },
          {
            is_completed: 1,
            _user_id: userId,
            month_name: `${moment(new Date()).format(monthFormat)}`,
          }
        );

        var resultNotification = await DBManager.getData("app_notification_token_master", "*", { _user_id: userId });
        var rowNotification = resultNotification?.rows || [];
        if (rowNotification && rowNotification.length) {
          let resultToken = rowNotification.map((row) => row.device_token);
          let messages = [
            {
              notification: {
                title: "🎉 Prizepool",
                body: `You won ${utils.formatAmountWithCurrency(cashbackPrize, null, 0)} in this months prizepool`,
              },
            },
          ];
          // Send Notification
          firebaseHelper.sendNotification(resultToken, messages);
        }
        response.status = true;
        response.message = "Prize Distributed Successfully.";
        return responseHelper.respondSuccess(res, 200, response);
      } else {
        response.message = "Cashback Prize Not Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
};
