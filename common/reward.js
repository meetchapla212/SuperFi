const moment = require("moment");
const DB = require("./../common/dbmanager");
const DBManager = new DB();
const _ = require("lodash");
const monthFormat = "YYYY-MM";
const utils = require("./../common/utils");

// This function is used to create user reward tasks json and complete reward task.
const checkReward = (user_id, reward_task, card_id) => {
  return new Promise(async (resolve, reject) => {
    try {
      var resultReward = await DBManager.getData("user_reward_master", "user_reward_id, reward_info, is_completed", {
        _user_id: user_id,
        month_name: `${moment(new Date()).format(monthFormat)}`,
      });
      var rowReward = resultReward?.rows || [];
      var rewardInfoData = [];
      // Create reward task json.
      if (!rowReward.length) {
        var resultTask = await DBManager.getData("reward_task_master", "reward_task_id", { is_active: 1 });
        var rowTask = resultTask?.rows || [];
        if (rowTask && rowTask.length) {
          // var resultCard = await DBManager.getData("user_card_master", "user_card_id", { _user_id: user_id });
          // var rowCard = resultCard?.rows || [];
          var resultRewardPrize = await DBManager.getData("app_settings", "setting_value", { setting_key: "cashback_reward_total_amount" });
          var rowRewardPrize = resultRewardPrize?.rows || [];
          let rewardInfo = {
            cashback_reward_total_prize: rowRewardPrize?.[0]?.setting_value,
          };
          await Promise.all(
            rowTask.map(async (task) => {
              let taskInfo = {
                reward_task_id: task.reward_task_id,
                complete: false,
              };
              if (task.reward_task_id == 1) {
                taskInfo.count = 0;
              }
              return taskInfo;
            })
          ).then(async (taskInfo) => {
            rewardInfo.tasks = taskInfo;
            rewardInfoData = JSON.parse(JSON.stringify(rewardInfo));
            let insertQry = {
              _user_id: user_id,
              month_name: `${moment(new Date()).format(monthFormat)}`,
              reward_info: JSON.stringify(rewardInfo),
            };
            await DBManager.dataInsert("user_reward_master", insertQry);
          });
        } else {
          return resolve({ status: true, message: "Reward tasks not found." });
        }
      } else {
        // Update reward task json.
        var resultRewardInfo = rowReward?.[0]?.reward_info;
        if (resultRewardInfo) {
          // var resultCard = await DBManager.getData("user_card_master", "user_card_id", { _user_id: user_id });
          // var rowCard = resultCard?.rows || [];
          var resultTask = await DBManager.getData("reward_task_master", "reward_task_id", { is_active: 1 });
          var rowTask = resultTask?.rows || [];
          if (rowTask && rowTask.length) {
            var rewardTask = resultRewardInfo?.tasks;
            await Promise.all(
              rowTask.map(async (task) => {
                let taskInfo = {
                  reward_task_id: task.reward_task_id,
                };
                let taskExist = _.filter(rewardTask, { reward_task_id: task.reward_task_id });
                if (taskExist && taskExist.length) {
                  taskInfo = taskExist?.[0] || taskInfo;
                } else {
                  if (task.reward_task_id == 1) {
                    taskInfo.count = 0;
                  }
                  taskInfo.complete = false;
                }

                return taskInfo;
              })
            ).then(async (taskInfo) => {
              var resultRewardPrize = await DBManager.getData("app_settings", "setting_value", { setting_key: "cashback_reward_total_amount" });
              var rowRewardPrize = resultRewardPrize?.rows || [];
              let pushCardReward = {
                tasks: taskInfo,
                is_completed: false,
                cashback_reward_total_prize: rowRewardPrize?.[0]?.setting_value,
              };
              rewardInfoData = pushCardReward;
            });
          }
        }
      }

      if (rewardInfoData) {
        // Task: Open SuperFi for 5 days in a row
        // Counts number of consecutive login.
        if (reward_task == "login") {
          var resultLoginDate =
            await DBManager.runQuery(`SELECT substring("logged_in_at", 1, 10) as login_date FROM users_login_history WHERE _user_id = '${user_id}' AND is_deleted = 0 AND
          date_part('month', logged_in_at::date) = date_part('month', now()::date) AND 
          date_part('year', logged_in_at::date) = date_part('year', now()::date)                                                
          GROUP BY substring("logged_in_at", 1, 10)`);
          var rowLoginDate = resultLoginDate?.rows || [];
          if (rowLoginDate && rowLoginDate.length) {
            var loginCount = await countConsecutiveLogin(rowLoginDate);
          }
        }

        if (reward_task == "minimum_pay_credit_card") {
          var taskComplete = true;
          var cardsResult = await DBManager.getData("user_card_master", "user_card_id, truelayer_card_id, card_details", { _user_id: user_id });
          var cardRow = cardsResult?.rows || [];
          var repaymentResult = await DBManager.getData("user_repayment_master", "_user_card_account_id,platform_card_account_id, paid_amount", {
            _user_id: user_id,
            account_type: "credit card",
            month_name: `${moment.utc().format(monthFormat)}`,
          });
          var repaymentRow = repaymentResult?.rows || [];
          if (repaymentRow && repaymentRow.length) {
            if (cardRow && cardRow.length) {
              await Promise.all(
                cardRow.map(async (card) => {
                  var paymentResult = _.find(repaymentRow, { _user_card_account_id: card.user_card_id });
                  if (!paymentResult) {
                    taskComplete = false;
                  }
                })
              );
            }
          }
        }

        if (reward_task == "pay_£5_more_than_minimum_repayment") {
          var taskComplete = false;
          var cardsResult = await DBManager.getData("user_card_master", "_user_id, user_card_id, truelayer_card_id, card_details", {
            _user_id: user_id,
          });
          var cardRow = cardsResult?.rows || [];
          var repaymentResult = await DBManager.getData(
            "user_repayment_master",
            "_user_id,_user_card_account_id, platform_card_account_id, paid_amount",
            {
              _user_id: user_id,
              account_type: "credit card",
              month_name: `${moment.utc().format(monthFormat)}`,
            }
          );
          var repaymentRow = repaymentResult?.rows || [];
          if (repaymentRow && repaymentRow.length) {
            if (cardRow && cardRow.length) {
              await Promise.all(
                repaymentRow.map(async (repayment) => {
                  var cardDetails = _.find(cardRow, { _user_id: repayment._user_id, user_card_id: repayment._user_card_account_id });
                  if (cardDetails) {
                    let decryptCardDetails = utils.decryptData(cardDetails.card_details);
                    var minimumRepayment = decryptCardDetails.minimum_repayment || 0;
                    if (minimumRepayment) {
                      if (parseInt(repayment.paid_amount) >= parseInt(minimumRepayment) + 5) {
                        taskComplete = true;
                      }
                    }
                  }
                })
              );
            }
          }
        }

        if (reward_task == "all_truelayer_accounts_connected") {
          var taskComplete = true;
          var tokenResult = await DBManager.getData("user_bank_account_master", "*", { _user_id: user_id });
          var tokenRow = tokenResult?.rows || [];
          if (tokenRow && tokenRow.length) {
            var expiredToken = _.find(tokenRow, { is_token_expired: 1 });
            if (expiredToken) {
              taskComplete = false;
            }
          }
        }

        var isAllTaskCompleted = false;

        var rewardInfo = rewardInfoData || {};
        var rewardTasks = rewardInfo?.tasks || [];
        if (rewardTasks && rewardTasks.length) {
          await Promise.all(
            rewardTasks.map(async (tasks) => {
              if (reward_task == "login") {
                if (tasks.reward_task_id == 1 && tasks.complete == false) {
                  tasks.count = loginCount;
                  tasks.complete = loginCount > 4 ? true : false;
                }
              }
              // Task: Make a payment towards your credit card balance.
              if (reward_task == "card_payment") {
                // if (rewardInfo.card_id == card_id && tasks.reward_task_id == 2 && tasks.complete == false)
                if (tasks.reward_task_id == 2 && tasks.complete == false) {
                  tasks.complete = true;
                }
              }
              // Task: Check your credit score this month.
              if (reward_task == "check_credit_score") {
                if (tasks.reward_task_id == 3 && tasks.complete == false) {
                  tasks.complete = true;
                }
              }
              if (reward_task == "minimum_pay_credit_card") {
                if (tasks.reward_task_id == 4 && tasks.complete == false) {
                  tasks.complete = true;
                }
              }
              // Task: View ways to improve your credit score.
              if (reward_task == "improve_credit_score") {
                if (tasks.reward_task_id == 5 && tasks.complete == false) {
                  tasks.complete = true;
                }
              }
              // Task: Ensure all existing accounts are connected through Truelayer.
              if (reward_task == "all_truelayer_accounts_connected") {
                if (tasks.reward_task_id == 6) {
                  tasks.complete = taskComplete;
                }
              }
              // Task: Put an extra £5 towards one of your debts this month.
              if (reward_task == "pay_£5_more_than_minimum_repayment") {
                if (tasks.reward_task_id == 7 && tasks.complete == false) {
                  tasks.complete = true;
                }
              }
              // Task: Put £10 extra towards your debts this month.
              if (reward_task == "pay_£10_more_than_suggested_payment") {
                if (tasks.reward_task_id == 8 && tasks.complete == false) {
                  tasks.complete = true;
                }
              }
              // Task: Check your interest rate is accurate for each account.
              if (reward_task == "check_interest_rate") {
                if (tasks.reward_task_id == 9 && tasks.complete == false) {
                  tasks.complete = true;
                }
              }
              // Task: Register to vote on the electoral roll.
              if (reward_task == "vote_electoral_roll") {
                if (tasks.reward_task_id == 10 && tasks.complete == false) {
                  tasks.complete = true;
                }
              }
              // Task: See the difference between Snowball and Avalanche methods for paying off your debt.
              if (reward_task == "calculation_method") {
                if (tasks.reward_task_id == 11 && tasks.complete == false) {
                  tasks.complete = true;
                }
              }
              // Task: Rate the SuperFi app in the profile section.
              if (reward_task == "rate_superfi") {
                if (tasks.reward_task_id == 12 && tasks.complete == false) {
                  tasks.complete = true;
                }
              }
            })
          ).then(async () => {
            // Check if all task completed.
            var completedTask = _.filter(rewardTasks, { complete: true });
            if (completedTask.length == rewardTasks.length) {
              rewardInfo.is_completed = true;
            }
            if (rewardInfo && rewardInfo.is_completed) {
              isAllTaskCompleted = true;
            }
            let dataObj = isAllTaskCompleted
              ? { reward_info: JSON.stringify(rewardInfoData), is_completed: 1 }
              : { reward_info: JSON.stringify(rewardInfoData) };
            await DBManager.dataUpdate("user_reward_master", dataObj, { _user_id: user_id, month_name: `${moment(new Date()).format(monthFormat)}` });
            return resolve({ status: true, message: "Reward info data updated." });
          });
        } else {
          return resolve({ status: true, message: "Reward tasks not found." });
        }
      } else {
        return resolve({ status: true, message: "Reward info not found." });
      }
    } catch (err) {
      return resolve({ status: false, message: err?.message || "Reward task not updated." });
    }
  });
};

// This function is used to count consecutive login days.
const countConsecutiveLogin = (login_date_array) => {
  let count = 0;
  login_date_array.reverse().forEach((element, index) => {
    if (new Date().setUTCHours(0, 0, 0, 0) - new Date(element.login_date).setUTCHours(0, 0, 0, 0) === index * 86400000) count++;
  });
  return count;
};

module.exports = {
  checkReward,
};
