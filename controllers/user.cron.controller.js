const responseHelper = require("./../common/responseHelper");
const superfiHelper = require("./../common/superfi");
const firebaseHelper = require("./../common/firebase");
const DB = require("./../common/dbmanager");
const moment = require("moment");
const DBManager = new DB();
const utils = require("./../common/utils");
const _ = require("lodash");
const monthFormat = "YYYY-MM";
const dateFormat = "YYYY-MM-DD HH:mm:ss";

module.exports = {
  // This Cron is used to update reward status.
  rewardStatusUpdate: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      await DBManager.dataUpdate("reward_task_master", { is_active: 0, status: "deactive" }, { status: "schedule deactive" });
      await DBManager.dataUpdate("reward_task_master", { is_active: 1, status: "active" }, { status: "schedule active" });
      response.status = true;
      response.message = "Reward Status Update Cronjob Completed.";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This Cron is used to distribute reward prize to users and send notification at the end of every month.
  rewardPrizeDistribute: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var eligibleUserResult = await DBManager.runQuery(
        `SELECT COUNT(*) as total FROM user_reward_master WHERE is_completed = 1 and month_name='${moment()
          .utc()
          .format(monthFormat)}' AND is_deleted = 0`
      );
      var eligibleUserRow = eligibleUserResult?.rows || [];
      if (eligibleUserRow && eligibleUserRow.length) {
        var eligibleUserCounts = parseInt(eligibleUserRow?.[0]?.total) || 0;
        if (eligibleUserCounts) {
          var cashbackPrize = await DBManager.getKeyValue("app_settings", "setting_value", {
            setting_key: "cashback_reward_total_amount",
          });
          if (cashbackPrize) {
            var distributedPrize = cashbackPrize ? (cashbackPrize / eligibleUserCounts).toFixed(2) : "";
            if (distributedPrize) {
              await DBManager.dataUpdate(
                "user_reward_master",
                {
                  win_reward_amount: distributedPrize,
                  reward_credit_date: `${moment().utc().format(dateFormat)}`,
                },
                {
                  is_completed: 1,
                  month_name: `${moment(new Date()).format(monthFormat)}`,
                }
              );

              var resultNotification = await DBManager.runQuery(
                `SELECT app_notification_token_master.* FROM app_notification_token_master INNER JOIN user_reward_master ON app_notification_token_master._user_id = user_reward_master._user_id WHERE user_reward_master.is_completed = 1 
                                AND user_reward_master.month_name='${moment().utc().format(monthFormat)}' AND user_reward_master.is_deleted = 0`
              );
              var rowNotification = resultNotification?.rows || [];
              if (rowNotification && rowNotification.length) {
                let resultToken = rowNotification.map((row) => row.device_token);
                let messages = [
                  {
                    notification: {
                      title: "SuperFi",
                      body: `🎉 Prizepool
                      You won ${utils.formatAmountWithCurrency(distributedPrize, null, 0)} in this months prizepool`,
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
              response.message = "Distributed Prize Not Found.";
              return responseHelper.respondSuccess(res, 200, response);
            }
          } else {
            response.message = "Cashback Prize Not Found.";
            return responseHelper.respondSuccess(res, 200, response);
          }
        } else {
          response.message = "No Eligible User Found.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        response.message = "No Eligible User Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  //This Cron is used to recalculate debt of every user.
  debtReCalculation: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var resultDebtCalculation = await DBManager.getData(
        "superfi_user_debt_record_master",
        "superfi_debt_calculation_id, _user_id, method_type, superfi_debt_calculation_details"
      );
      var rowDebtCalculation = resultDebtCalculation?.rows || [];
      if (rowDebtCalculation && rowDebtCalculation.length) {
        await Promise.all(
          rowDebtCalculation.map(async (debtCalculation) => {
            var superfiDebCalculation = debtCalculation?.superfi_debt_calculation_details || {};
            if (superfiDebCalculation) {
              var cardsAccounts = superfiDebCalculation?.avalanche?.cards_accounts || superfiDebCalculation?.snowball?.cards_accounts || [];
              if (cardsAccounts && cardsAccounts.length) {
                await Promise.all(
                  cardsAccounts.map(async (cardAccount) => {
                    var repaymentResult = await DBManager.runQuery(
                      `SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${debtCalculation._user_id}' and platform_card_account_id = '${
                        cardAccount.platform_card_account_id
                      }' and month_name = '${moment().utc().subtract(1, "months").format(monthFormat)}' AND status = 'active' AND is_deleted = 0`
                    );
                    var repaymentRow = repaymentResult?.rows || [];
                    if (repaymentRow && repaymentRow.length) {
                      cardAccount.current_balance = repaymentRow?.[0]?.paid_amount
                        ? cardAccount.current_balance - repaymentRow?.[0]?.paid_amount
                        : cardAccount.current_balance;
                      await DBManager.dataUpdate(
                        "user_repayment_master",
                        { status: "paid" },
                        {
                          _user_id: debtCalculation._user_id,
                          platform_card_account_id: cardAccount.platform_card_account_id,
                          month_name: moment().utc().subtract(1, "months").format(monthFormat),
                        }
                      );
                    }
                  })
                ).then(async () => {
                  if (
                    superfiDebCalculation.avalanche &&
                    superfiDebCalculation.avalanche.pay_amount &&
                    superfiDebCalculation.avalanche.cards_accounts
                  ) {
                    var resultNonSuperfi = await superfiHelper.nonSuperfiCalculation(superfiDebCalculation.avalanche.cards_accounts);
                    var resultAvalanche = await superfiHelper.avalancheCalculation(
                      superfiDebCalculation.avalanche.pay_amount,
                      superfiDebCalculation.avalanche.cards_accounts
                    );
                    superfiDebCalculation.avalanche = resultAvalanche?.data || superfiDebCalculation.avalanche;
                    superfiDebCalculation.nonsuperfi = resultNonSuperfi?.data || superfiDebCalculation.nonsuperfi;
                  }
                  if (superfiDebCalculation.snowball && superfiDebCalculation.snowball.pay_amount && superfiDebCalculation.snowball.cards_accounts) {
                    var resultNonSuperfi = await superfiHelper.nonSuperfiCalculation(superfiDebCalculation.snowball.cards_accounts);
                    var resultSnowball = await superfiHelper.avalancheCalculation(
                      superfiDebCalculation.snowball.pay_amount,
                      superfiDebCalculation.snowball.cards_accounts
                    );
                    superfiDebCalculation.snowball = resultSnowball?.data || superfiDebCalculation.snowball;
                    superfiDebCalculation.nonsuperfi = resultNonSuperfi?.data || superfiDebCalculation.nonsuperfi;
                  }
                  console.log(superfiDebCalculation);
                  await DBManager.dataUpdate(
                    "superfi_user_debt_record_master",
                    {
                      superfi_debt_calculation_details: JSON.stringify(superfiDebCalculation),
                    },
                    {
                      superfi_debt_calculation_id: debtCalculation.superfi_debt_calculation_id,
                    }
                  );
                });
              }
            }
          })
        ).then(() => {
          response.status = true;
          response.message = "Debt Recalculation Completed.";
          return responseHelper.respondSuccess(res, 200, response);
        });
      } else {
        response.status = false;
        response.message = "Dashboard Info Not Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This Cron is used to send card payment due notification, cron runs daily.
  sendDueNotification: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var resultUser = await DBManager.getData("users_master", "user_id, user_preference_setting", {
        status: "active",
      });
      var rowUser = resultUser?.rows || [];
      rowUser = _.filter(rowUser, (user) => {
        if (
          user.user_preference_setting &&
          user.user_preference_setting.push_notification_preferences &&
          user.user_preference_setting.push_notification_preferences == 1
        ) {
          return user;
        }
      });
      if (rowUser && rowUser.length) {
        // Users Cards
        await Promise.all(
          rowUser.map(async (user) => {
            var resultCard = await DBManager.getData("user_card_master", "*", {
              _user_id: user.user_id,
            });
            var rowCard = resultCard?.rows || [];
            if (rowCard && rowCard.length) {
              await Promise.all(
                rowCard.map(async (card) => {
                  var decryptCardDetails = utils.decryptData(card.card_details);
                  var cardDetails = decryptCardDetails || {};
                  if (cardDetails) {
                    var estimatedDueDate = cardDetails?.updated_estimated_due_date
                      ? moment(cardDetails.updated_estimated_due_date).utc().format("DD")
                      : cardDetails?.estimated_due_date
                      ? moment(cardDetails.estimated_due_date).utc().format("DD")
                      : "";
                    if (estimatedDueDate) {
                      let currentDate = moment().utc().format("DD");
                      if (currentDate == estimatedDueDate) {
                        var resultNotification = await DBManager.getData("app_notification_token_master", "*", {
                          _user_id: card._user_id,
                        });
                        var rowNotification = resultNotification?.rows || [];
                        if (rowNotification && rowNotification.length) {
                          let resultToken = rowNotification.map((row) => row.device_token);
                          let messages = [
                            {
                              notification: {
                                title: "SuperFi",
                                body: `💳 Your ${
                                  cardDetails?.card_type_name || cardDetails?.provider?.display_name || cardDetails?.provider_name
                                } is due today`,
                              },
                              // notification: {
                              //     title: 'Testing push notifcation',
                              //     body: `This notification is just for the testing purpose`
                              // }
                            },
                          ];
                          // Send Notification
                          await firebaseHelper.sendNotification(resultToken, messages);
                        }
                      }
                    }
                  }
                })
              );
            }
          })
        );

        // Klarna
        await Promise.all(
          rowUser.map(async (user) => {
            var resultKlarna = await DBManager.getData("user_klarna_account_master", "*", {
              _user_id: user.user_id,
            });
            var rowKlarna = resultKlarna?.rows || [];
            if (rowKlarna && rowKlarna.length) {
              await Promise.all(
                rowKlarna.map(async (klarna) => {
                  var installmentDetails = klarna?.payment_installments_details?.installments || [];
                  if (klarna.payment_schedule == "Pay in 30 days") {
                    let estimatedDueDate = klarna.date_of_purchase ? moment(klarna.date_of_purchase).utc().add(30, "d").format("YYYY-MM-DD") : "";
                    let dayBeforeDueDate = klarna.date_of_purchase ? moment(klarna.date_of_purchase).utc().add(29, "d").format("YYYY-MM-DD") : "";
                    let currentDate = moment().utc().format("YYYY-MM-DD");
                    if (currentDate == estimatedDueDate || currentDate == dayBeforeDueDate) {
                      var resultNotification = await DBManager.getData("app_notification_token_master", "*", {
                        _user_id: klarna._user_id,
                      });
                      var rowNotification = resultNotification?.rows || [];
                      if (rowNotification && rowNotification.length) {
                        let resultToken = rowNotification.map((row) => row.device_token);
                        let messages =
                          currentDate == estimatedDueDate
                            ? [
                                {
                                  notification: {
                                    title: "SuperFi",
                                    body: `💳 Your Klarna is due today`,
                                  },
                                },
                                {
                                  notification: {
                                    title: "SuperFi",
                                    body: `💳 Your Klarna payment is due today of ${utils.formatAmountWithCurrency(
                                      Math.abs(klarna.price_of_purchase),
                                      null,
                                      0
                                    )}`,
                                  },
                                },
                              ]
                            : [
                                {
                                  notification: {
                                    title: "SuperFi",
                                    body: `🔜 You’re about to get charged by Klarna tomorrow`,
                                  },
                                },
                              ];
                        // Send Notification
                        firebaseHelper.sendNotification(resultToken, messages);
                      }
                    }
                  } else if (klarna.payment_schedule == "Pay in 3 installments") {
                    if (installmentDetails) {
                      await Promise.all(
                        installmentDetails.map(async (installment) => {
                          if (!installment.completed) {
                            let estimatedDueDate = moment(installment.installments_date).utc().format("YYYY-MM-DD");
                            let dayBeforeDueDate = moment(installment.installments_date).utc().subtract(1, "days").format("YYYY-MM-DD");
                            let currentDate = moment().utc().format("YYYY-MM-DD");
                            if (currentDate == estimatedDueDate || currentDate == dayBeforeDueDate) {
                              var resultNotification = await DBManager.getData("app_notification_token_master", "*", {
                                _user_id: klarna._user_id,
                              });
                              var rowNotification = resultNotification?.rows || [];
                              if (rowNotification && rowNotification.length) {
                                let resultToken = rowNotification.map((row) => row.device_token);
                                let messages =
                                  currentDate == estimatedDueDate
                                    ? [
                                        {
                                          notification: {
                                            title: "SuperFi",
                                            body: `💳 Your Klarna is due today`,
                                          },
                                        },
                                        {
                                          notification: {
                                            title: "SuperFi",
                                            body: `💳 Your Klarna payment is due today of ${utils.formatAmountWithCurrency(
                                              Math.abs(installment.installment_amount),
                                              null,
                                              0
                                            )}`,
                                          },
                                        },
                                      ]
                                    : [
                                        {
                                          notification: {
                                            title: "SuperFi",
                                            body: `🔜 You’re about to get charged by Klarna tomorrow`,
                                          },
                                        },
                                      ];
                                // Send Notification
                                firebaseHelper.sendNotification(resultToken, messages);
                              }
                            }
                          }
                        })
                      );
                    }
                  }
                })
              );
            }
          })
        );
      }
      console.log("Cron executed at ", moment().utc().format(dateFormat));
      response.status = true;
      response.message = "Notification Daily Cron Completed.";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This Cron is used to active random 3 reward tasks at the start of every month.
  activeRandomRewards: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var activeTaskId = [];
      var resultTasks = await DBManager.getData("reward_task_master", "*");
      var rowTasks = resultTasks?.rows || [];
      if (rowTasks && rowTasks.length) {
        while (activeTaskId.length < 3) {
          let randomNumber = Math.floor(Math.random() * rowTasks.length);
          if (!(await _.find(activeTaskId, rowTasks[randomNumber].reward_task_id))) {
            activeTaskId.push(rowTasks[randomNumber].reward_task_id);
          }
        }
      }
      await DBManager.dataUpdate("reward_task_master", { is_active: 0, status: "deactive" });
      await DBManager.runQuery(`UPDATE reward_task_master SET is_active = 1, status = 'active'
      WHERE reward_task_id IN (${activeTaskId})`);

      response.status = true;
      response.message = "Reward Status Update Cronjob Completed.";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
};
