var config = require("./../config/config");
const validate = require("../validations/user.superfi.validation");
const superfiHelper = require("./../common/superfi");
const responseHelper = require("./../common/responseHelper");
const truelayerHelper = require("./../common/truelayer");
const rewardHelper = require("./../common/reward");
const klarnaHelper = require("./../common/klarna");
const axios = require("axios").default;
const { EMAIL_SUBJECTS, DEFAULT_EMAIL_LINKS } = require("../common/constants");
const utils = require("./../common/utils");
const fs = require("fs");
const DB = require("./../common/dbmanager");
const DBManager = new DB();
const _ = require("lodash");
const moment = require("moment");
const { method } = require("lodash");
const monthFormat = "YYYY-MM";
const dateFormat = "YYYY-MM-DD HH:mm:ss";

module.exports = {
  // This function is used to calculate debt of users card, overdraft and klarna.
  calculationMethod: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { userId } = req.user;
      const { method_type, send_mail } = req.query;
      var responseData = {};
      await superfiHelper.updateScreenVisitDate("debt_calculator_last_visit_date", userId);
      if (apiData.cards_accounts.length == 0) {
        var resultDebtCalculation = await DBManager.runQuery(
          `SELECT * FROM superfi_user_debt_record_master WHERE _user_id = '${userId}' ORDER BY date_modified DESC`
        );
        var rowDebtCalculation = resultDebtCalculation?.rows || [];
        if (rowDebtCalculation && rowDebtCalculation.length) {
          var methodData = rowDebtCalculation[0].superfi_debt_calculation_details[`${rowDebtCalculation[0].method_type}`];
          rowDebtCalculation[0].superfi_debt_calculation_details["nonsuperfi"].totalMonths = 0;
          rowDebtCalculation[0].superfi_debt_calculation_details["nonsuperfi"].totalInterest = 0;
          methodData.cards_accounts = [];
          methodData.monthly_interest_saved = 0;
          methodData.non_calculation_accounts = [];
          methodData.totalInterest = 0;
          methodData.totalMonths = 0;
          await DBManager.dataUpdate(
            "superfi_user_debt_record_master",
            {
              superfi_debt_calculation_details: JSON.stringify(rowDebtCalculation[0].superfi_debt_calculation_details),
            },
            {
              superfi_debt_calculation_id: rowDebtCalculation[0].superfi_debt_calculation_id,
            }
          );
          response.status = true;
          response.message = "You're Debt Free";
          response.data = [
            {
              method_type: method_type,
              superfi_debt_calculation_details: [],
            },
          ];
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        await validate.checkCalculationData(apiData, method_type);
        var cardsAccounts = _.filter(apiData.cards_accounts, (row) => {
          if (row.user_card_id && row.current_balance && row.current_balance > 0) {
            return row;
          }
          if (row.user_overdraft_account_id && row.current_balance && row.current_balance < 0) {
            return row;
          }
        });
        var nonCalculationAccounts = _.filter(apiData.cards_accounts, (row) => {
          if (row.klarna_id) {
            return row;
          }
          if (row.user_card_id && (row.current_balance ? row.current_balance : 0) <= 0) {
            return row;
          }
          if (row.user_overdraft_account_id && (row.current_balance ? row.current_balance : 0) >= 0) {
            return row;
          }
        });
        // Nonsuperfi method calculation
        var resultNonSuperfi = await superfiHelper.nonSuperfiCalculation(cardsAccounts, nonCalculationAccounts);
        // Avalanche method calculation
        var resultCardsAccounts = [];
        if (method_type == "avalanche") {
          var resultAvalanche = await superfiHelper.avalancheCalculation(apiData.original_pay_amount, cardsAccounts, nonCalculationAccounts);
          const monthlyInterestSaved =
            resultNonSuperfi.data.totalInterest &&
            resultNonSuperfi.data.totalMonths &&
            resultAvalanche.data.totalMonths &&
            +resultNonSuperfi.data.totalMonths != +resultAvalanche.data.totalMonths
              ? +Math.abs(+resultNonSuperfi.data.totalInterest - +resultAvalanche.data.totalInterest) /
                (+resultNonSuperfi.data.totalMonths - +resultAvalanche.data.totalMonths)
              : 0;
          resultCardsAccounts = resultAvalanche?.data?.cards_accounts || [];
          response.message = resultAvalanche?.message || "Avalanche Calculation Successfully.";
          response.status = resultAvalanche.status;
          responseData = {
            nonsuperfi: resultNonSuperfi.data,
            avalanche: {
              monthly_interest_saved: monthlyInterestSaved.toFixed(2),
              non_calculation_accounts: nonCalculationAccounts || [],
              original_pay_amount: apiData.original_pay_amount,
              ...resultAvalanche.data,
            },
          };
        }
        // Snowball method calculation
        if (method_type == "snowball") {
          var resultSnowball = await superfiHelper.snowballCalculation(apiData.original_pay_amount, cardsAccounts, nonCalculationAccounts);
          const monthlyInterestSaved =
            resultNonSuperfi.data.totalInterest &&
            resultNonSuperfi.data.totalMonths &&
            resultSnowball.data.totalMonths &&
            +resultNonSuperfi.data.totalMonths != +resultSnowball.data.totalMonths
              ? +Math.abs(+resultNonSuperfi.data.totalInterest - +resultSnowball.data.totalInterest) /
                (+resultNonSuperfi.data.totalMonths - +resultSnowball.data.totalMonths)
              : 0;
          resultCardsAccounts = resultSnowball?.data?.cards_accounts || [];
          response.message = resultSnowball?.message || "Snowball Calculation Successfully.";
          response.status = resultSnowball.status;
          responseData = {
            nonsuperfi: resultNonSuperfi.data,
            snowball: {
              monthly_interest_saved: monthlyInterestSaved.toFixed(2),
              non_calculation_accounts: nonCalculationAccounts || [],
              original_pay_amount: apiData.original_pay_amount,
              ...resultSnowball.data,
            },
          };
        }
        // Card Account approx monthly cost
        await Promise.all(
          resultCardsAccounts.map(async (cardAccount) => {
            //     let totalMonths =
            //         responseData?.avalanche?.totalMonths ||
            //         responseData?.snowball?.totalMonths;
            let approxMonthlyCost =
              cardAccount.current_balance && (cardAccount?.updated_interest_rate || cardAccount?.custom_interest_rate || cardAccount?.interest_rate)
                ? //  && totalMonths
                  cardAccount.current_balance *
                  ((cardAccount?.updated_interest_rate || cardAccount?.custom_interest_rate || cardAccount?.interest_rate) / 100 / 12)
                : "-";
            if (cardAccount.user_card_id) {
              var resultData = await DBManager.getData("user_card_master", "*", {
                user_card_id: cardAccount.user_card_id,
              });
              var rowData = resultData.rows || [];
              if (rowData && rowData.length) {
                var decryptCardDetails = utils.decryptData(rowData[0].card_details);
                decryptCardDetails.approx_monthly_cost = Math.abs(approxMonthlyCost.toFixed(2));
                await DBManager.dataUpdate(
                  "user_card_master",
                  { card_details: await utils.encryptData(decryptCardDetails) },
                  { user_card_id: cardAccount.user_card_id }
                );
              }
            } else if (cardAccount.user_overdraft_account_id) {
              var resultData = await DBManager.getData("user_overdraft_account_master", "*", {
                user_overdraft_account_id: cardAccount.user_overdraft_account_id,
              });
              var rowData = resultData.rows || [];
              if (rowData && rowData.length) {
                var decryptAccountDetails = utils.decryptData(rowData[0].account_details);
                decryptAccountDetails.approx_monthly_cost = Math.abs(approxMonthlyCost.toFixed(2));
                await DBManager.dataUpdate(
                  "user_overdraft_account_master",
                  {
                    account_details: await utils.encryptData(decryptAccountDetails),
                  },
                  {
                    user_overdraft_account_id: cardAccount.user_overdraft_account_id,
                  }
                );
              }
            }
          })
        );

        var checkPaymentCardsAccounts = resultCardsAccounts.concat(nonCalculationAccounts);
        if (checkPaymentCardsAccounts && checkPaymentCardsAccounts.length) {
          await Promise.all(
            checkPaymentCardsAccounts.map(async (cardAccount) => {
              if (cardAccount.user_card_id) {
                let data = cardAccount.platform_card_account_id
                  ? {
                      user: { userId: userId },
                      body: { bank_id: cardAccount.bank_id },
                    }
                  : "";
                var resultToken = cardAccount.platform_card_account_id ? await truelayerHelper.generateTruelayerToken(data) : {};
                var rowToken = resultToken?.data || [];
                var rowTransaction = [];
                var paidAmount = 0;
                var estimatedDueDate = "";
                if (resultToken.status && cardAccount.platform_card_account_id) {
                  let startDate = moment().utc().clone().startOf("month").format(dateFormat);
                  let endDate = moment().utc().format("YYYY-MM-DD");
                  var resultTransaction = await axios.request({
                    method: "get",
                    url: utils.escapeUrl(`${config.TRUELAYER_API_BASE_URL}/data/v1/cards/${cardAccount.platform_card_account_id}/transactions`),
                    headers: {
                      "content-type": "application/x-www-form-urlencoded",
                      Authorization: `Bearer ${rowToken.access_token}`,
                    },
                  });
                  rowTransaction = resultTransaction?.data?.results || [];
                  if (rowTransaction && rowTransaction.length) {
                    var allCreditTransaction = _.filter(rowTransaction, (row) => {
                      if (row.transaction_type == "CREDIT" && row.description == "PAYMENT RECEIVED - THANK YOU") {
                        return row;
                      }
                    });
                    var creditTransaction = _.filter(allCreditTransaction, (row) => {
                      if (
                        moment(row.timestamp).utc().format("YYYY-MM-DD") > startDate &&
                        moment(row.timestamp).utc().format("YYYY-MM-DD") < endDate
                      ) {
                        return row;
                      }
                    });
                    creditTransaction.forEach((transaction) => {
                      paidAmount += Math.abs(transaction.amount);
                    });
                    if (allCreditTransaction.length && allCreditTransaction[0].timestamp) {
                      estimatedDueDate = moment(allCreditTransaction[0].timestamp).utc().format(dateFormat);
                      var cardResult = await DBManager.getData("user_card_master", "*", { user_card_id: cardAccount.user_card_id });
                      var cardRow = cardResult?.rows || [];
                      if (cardRow && cardRow.length) {
                        let cardDetails = utils.decryptData(cardRow[0].card_details);
                        cardDetails.estimated_due_date = estimatedDueDate;
                        await DBManager.dataUpdate(
                          "user_card_master",
                          {
                            card_details: await utils.encryptData(cardDetails),
                          },
                          { user_card_id: cardAccount.user_card_id }
                        );
                      }
                    }
                  }
                }
                if (paidAmount && cardAccount.platform_card_account_id) {
                  paidAmount = paidAmount.toFixed(2);
                  var repaymentResult = await DBManager.runQuery(
                    `SELECT paid_amount, user_repayment_id FROM user_repayment_master WHERE _user_id = '${userId}' and _user_card_account_id = '${
                      cardAccount.user_card_id
                    }' and account_type = 'credit card' and month_name = '${moment().utc().format(monthFormat)}' AND is_deleted = 0`
                  );
                  var repaymentRow = repaymentResult?.rows || [];
                  if (repaymentRow && repaymentRow.length) {
                    await DBManager.dataUpdate(
                      "user_repayment_master",
                      { paid_amount: paidAmount },
                      { user_repayment_id: repaymentRow[0].user_repayment_id }
                    );
                  } else {
                    var insertData = {
                      _user_id: userId,
                      platform_card_account_id: cardAccount.platform_card_account_id,
                      _user_card_account_id: cardAccount.user_card_id,
                      account_type: "credit card",
                      paid_amount: paidAmount,
                      month_name: moment.utc().format(monthFormat),
                    };
                    await DBManager.dataInsert("user_repayment_master", insertData);
                  }
                }
                // cardAccount.paid_amount = paidAmount ? paidAmount : 0;
                // cardAccount.repayment_paid = paidAmount ? true : false;
              }
              cardAccount.repayment_paid = false;
              cardAccount.paid_amount = 0;
              // User monthly debt paid amount.
              var repaymentResult = cardAccount.user_card_id
                ? await DBManager.runQuery(
                    `SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and _user_card_account_id = '${
                      cardAccount.user_card_id
                    }' and account_type = 'credit card' and month_name = '${moment().utc().format(monthFormat)}' AND is_deleted = 0`
                  )
                : cardAccount.user_overdraft_account_id
                ? await DBManager.runQuery(
                    `SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and _user_card_account_id = '${
                      cardAccount.user_overdraft_account_id
                    }' and account_type = 'overdraft' and month_name = '${moment().utc().format(monthFormat)}' AND is_deleted = 0`
                  )
                : await DBManager.runQuery(
                    `SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and bnpl_platform_id = ${
                      cardAccount.klarna_id
                    } and month_name = '${moment().utc().format(monthFormat)}' AND is_deleted = 0`
                  );

              var repaymentRow = repaymentResult?.rows || [];
              if (repaymentRow && repaymentRow.length) {
                cardAccount.paid_amount = repaymentRow?.[0]?.paid_amount || cardAccount.paid_amount;
                // cardAccount.current_balance = repaymentRow?.[0]?.paid_amount ? cardAccount.current_balance - repaymentRow?.[0]?.paid_amount : cardAccount.current_balance;
                cardAccount.repayment_paid = cardAccount.paid_amount ? true : false;
                // Check Reward
                if (cardAccount && cardAccount.user_card_id && cardAccount.paid_amount) {
                  await rewardHelper.checkReward(userId, "card_payment");
                }
                if (
                  cardAccount &&
                  cardAccount.user_card_id &&
                  (cardAccount.initial_minimum_repayment ? cardAccount.paid_amount >= cardAccount.initial_minimum_repayment + 5 : false)
                ) {
                  await rewardHelper.checkReward(userId, "pay_£5_more_than_minimum_repayment");
                }
                if (
                  cardAccount &&
                  cardAccount.user_card_id &&
                  (cardAccount.initial_minimum_repayment ? cardAccount.paid_amount >= cardAccount.initial_minimum_repayment : false)
                ) {
                  await rewardHelper.checkReward(userId, "minimum_pay_credit_card");
                }
                if (
                  cardAccount &&
                  cardAccount.user_card_id &&
                  (cardAccount.initial_suggested_payment ? cardAccount.paid_amount >= cardAccount.initial_suggested_payment + 10 : false)
                ) {
                  await rewardHelper.checkReward(userId, "pay_£10_more_than_suggested_payment");
                }
              }
            })
          );
        }
        if (nonCalculationAccounts && nonCalculationAccounts.length) {
          await Promise.all(
            nonCalculationAccounts.map(async (cardAccount) => {
              if (cardAccount.klarna_id) {
                let resultData = await klarnaHelper.checkKlarnaPayments(userId, cardAccount.klarna_id, cardAccount);
                if (resultData.status) {
                  cardAccount = resultData.data;
                }
              }
            })
          );
        }
        if (!method_type || method_type == "nonsuperfi") {
          if (send_mail && send_mail == "true") {
            var resultUser = await DBManager.getData("users_master", "*", {
              user_id: userId,
            });
            var rowUser = resultUser?.rows || [];
            if (rowUser && rowUser.length) {
              var userName = rowUser?.[0]?.["first_name"] || emailName || "guest";
              var email_id = rowUser?.[0]?.["u_email_id"];
              userName = userName.charAt(0).toUpperCase() + userName.slice(1);
              if (email_id) {
                const redirectUrl = `${config.DOMAIN}/api/user/superfi/verify-url?type=welcome_mail`;
                var template = fs.readFileSync("./email-templates/welcome.html", "utf8");
                var templateVars = {
                  ...DEFAULT_EMAIL_LINKS,
                  ...{
                    name: userName,
                    redirectUrl,
                  },
                };
                var mailTemplate = _.template(template)(templateVars);
                await utils.sendEmail(email_id, EMAIL_SUBJECTS.WELCOME_EMAIL.subject, EMAIL_SUBJECTS.WELCOME_EMAIL.text, mailTemplate);
              }
            }
          }
          response.message = resultNonSuperfi?.message || "Non Superfi Calculation Successfully.";
          response.status = resultNonSuperfi.status;
          response.data = resultNonSuperfi.data;
        }
        if (response.status && (method_type == "avalanche" || method_type == "snowball")) {
          var resultData = await DBManager.getData(
            "superfi_user_debt_record_master",
            "superfi_debt_calculation_id, method_type, superfi_debt_calculation_details",
            { _user_id: userId }
          );
          var rowData = resultData?.rows || [];
          var resultSuperfiCalculation = await _.find(rowData, {
            method_type: req?.query?.method_type,
          });
          var superfiDebtCalculationId = resultSuperfiCalculation?.superfi_debt_calculation_id;
          var superfiDebtCalculationDetails = resultSuperfiCalculation?.superfi_debt_calculation_details;
          var filterResponseData = responseData?.avalanche?.cards_accounts || responseData?.snowball?.cards_accounts;
          filterResponseData.map((card_account) => {
            let superfiCardsAccounts =
              superfiDebtCalculationDetails?.avalanche?.cards_accounts || superfiDebtCalculationDetails?.snowball?.cards_accounts;
            return {
              ...card_account,
              initial_suggested_payment:
                superfiCardsAccounts && superfiCardsAccounts.length
                  ? card_account.user_card_id
                    ? _.find(superfiCardsAccounts, {
                        user_card_id: card_account.user_card_id,
                      })?.suggested_payment ||
                      card_account?.suggested_payment ||
                      ""
                    : card_account.user_overdraft_account_id
                    ? _.find(superfiCardsAccounts, {
                        user_overdraft_account_id: card_account.user_overdraft_account_id,
                      })?.suggested_payment ||
                      card_account?.suggested_payment ||
                      ""
                    : card_account?.initial_suggested_payment || card_account?.suggested_payment || ""
                  : card_account.suggested_payment,
            };
          });
          if (superfiDebtCalculationId) {
            var dataObj = {
              superfi_debt_calculation_details: JSON.stringify(responseData),
            };
            await DBManager.dataUpdate("superfi_user_debt_record_master", dataObj, { superfi_debt_calculation_id: superfiDebtCalculationId });
          } else {
            var insertData = {
              _user_id: userId,
              method_type: req?.query?.method_type || "nonsuperfi",
              superfi_debt_calculation_details: JSON.stringify(responseData),
              date_modified: moment.utc().format(dateFormat),
            };
            await DBManager.dataInsert("superfi_user_debt_record_master", insertData);
          }
          response.data = [
            {
              method_type: method_type,
              superfi_debt_calculation_details: responseData,
            },
          ];
        }
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get users dashboard information.
  dashboardInfo: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { userId } = req.user;
      // User debt calculated data.
      await superfiHelper.updateScreenVisitDate("debt_calculator_last_visit_date", userId);

      var resultDebtCalculation = await DBManager.runQuery(
        `SELECT * FROM superfi_user_debt_record_master WHERE _user_id = '${userId}' ORDER BY date_modified DESC`
      );
      var rowDebtCalculation = resultDebtCalculation?.rows || [];
      if (rowDebtCalculation && rowDebtCalculation.length) {
        var resultCalculation = await DBManager.runQuery(
          `SELECT * FROM superfi_user_debt_record_master WHERE _user_id = '${userId}' AND date_modified LIKE '${moment()
            .utc()
            .format(monthFormat)}%' ORDER BY date_modified DESC`
        );
        var rowCalculation = resultCalculation?.rows || [];
        if (rowCalculation.length > 1) {
          await rewardHelper.checkReward(userId, "calculation_method");
        }
        await Promise.all(
          rowDebtCalculation.map(async (debtCalculation) => {
            debtCalculation.is_pay_amount_editable = true;
            var superfiDebCalculation = debtCalculation?.superfi_debt_calculation_details || {};
            if (superfiDebCalculation) {
              var cardsAccounts =
                superfiDebCalculation?.avalanche?.cards_accounts.concat(superfiDebCalculation?.avalanche?.non_calculation_accounts) ||
                superfiDebCalculation?.snowball?.cards_accounts.concat(superfiDebCalculation?.snowball?.non_calculation_accounts) ||
                [];
              if (cardsAccounts && cardsAccounts.length) {
                await Promise.all(
                  cardsAccounts.map(async (cardAccount) => {
                    cardAccount.repayment_paid = false;
                    cardAccount.paid_amount = 0;
                    // User monthly debt paid amount.
                    var repaymentResult = cardAccount.user_card_id
                      ? await DBManager.runQuery(
                          `SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and _user_card_account_id = '${
                            cardAccount.user_card_id
                          }'  and account_type = 'credit card' and month_name = '${moment().utc().format(monthFormat)}' AND is_deleted = 0`
                        )
                      : cardAccount.user_overdraft_account_id
                      ? await DBManager.runQuery(
                          `SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and _user_card_account_id = '${
                            cardAccount.user_overdraft_account_id
                          }'  and account_type = 'overdraft' and month_name = '${moment().utc().format(monthFormat)}' AND is_deleted = 0`
                        )
                      : await DBManager.runQuery(
                          `SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and bnpl_platform_id = ${
                            cardAccount.klarna_id
                          } and month_name = '${moment().utc().format(monthFormat)}' AND is_deleted = 0`
                        );
                    var repaymentRow = repaymentResult?.rows || [];
                    if (repaymentRow && repaymentRow.length) {
                      cardAccount.paid_amount = repaymentRow?.[0]?.paid_amount || cardAccount.paid_amount;
                      // cardAccount.current_balance = repaymentRow?.[0]?.paid_amount ? cardAccount.current_balance - repaymentRow?.[0]?.paid_amount : cardAccount.current_balance;
                      cardAccount.repayment_paid = cardAccount.paid_amount ? true : false;
                    }
                    if (cardAccount.repayment_paid) {
                      debtCalculation.is_pay_amount_editable = false;
                    }
                  })
                );
              }
            }
          })
        ).then(() => {
          response.data = rowDebtCalculation;
          response.status = true;
          response.message = "Dashboard Info Listed Successfully.";
          return responseHelper.respondSuccess(res, 200, response);
        });
      } else {
        response.status = true;
        response.message = "Dashboard Info Not Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get users card and overdraft account details.
  allCardsAccountsInfo: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { userId } = req.user;
      var responseData = {};
      // Cards info.
      var resultUserCards =
        await DBManager.runQuery(`SELECT user_card_master.*, card_type_id, card_brand_id, brand_name, brand_image, card_type_name, interest_rate, card_type_image FROM user_card_master
                                        LEFT JOIN card_brand_type_master on user_card_master."_card_type_id" = card_brand_type_master.card_type_id AND card_brand_type_master.is_deleted = user_card_master.is_deleted
                                        LEFT JOIN card_brand_master ON card_brand_type_master._card_brand_id = card_brand_master.card_brand_id and card_brand_master.is_deleted = card_brand_type_master.is_deleted
                                        WHERE _user_id = '${userId}' AND user_card_master.is_deleted = 0`);
      var rowUserCards = resultUserCards?.rows || [];
      if (rowUserCards && rowUserCards.length) {
        await Promise.all(
          rowUserCards.map(async (userCard) => {
            var decryptCardDetails = await utils.decryptData(userCard.card_details);
            let responseUserCard = {
              user_card_id: userCard.user_card_id,
              bank_id: userCard._bank_id,
              display_name: decryptCardDetails.provider?.display_name || "",
              provider_id: decryptCardDetails.provider?.provider_id || "",
              logo_uri: decryptCardDetails.provider?.logo_uri || "",
              available_balance: decryptCardDetails?.available_balance || "",
              original_balance: decryptCardDetails?.original_balance || "",
              current_balance: decryptCardDetails?.current_balance || "",
              credit_limit: decryptCardDetails?.credit_limit || "",
              updated_credit_limit: decryptCardDetails?.updated_credit_limit || 0,
              minimum_repayment: decryptCardDetails?.minimum_repayment || "",
              card_brand_id: userCard?.card_brand_id || "",
              card_type_id: userCard?.card_type_id || "",
              card_type_name: userCard?.card_type_name || "",
              interest_rate: userCard?.interest_rate || "",
              card_type_image: userCard?.card_type_image || "",
              custom_brand_type_name: userCard?.custom_brand_type_name || "",
              custom_interest_rate: userCard?.custom_interest_rate || "",
              repayment_paid: false,
              paid_amount: 0,
            };
            var repaymentResult = await DBManager.runQuery(
              `SELECT SUM(paid_amount), ( SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and platform_card_account_id = '${
                userCard.truelayer_card_id
              }' and month_name = '${moment()
                .utc()
                .format(monthFormat)}' AND is_deleted = 0) FROM user_repayment_master WHERE _user_id = '${userId}' and platform_card_account_id = '${
                userCard.truelayer_card_id
              }' AND is_deleted = 0`
            );
            var repaymentRow = repaymentResult?.rows || [];
            if (repaymentRow && repaymentRow.length) {
              responseUserCard.paid_amount = repaymentRow?.[0]?.paid_amount || responseUserCard.paid_amount;
              responseUserCard.current_balance = repaymentRow?.[0]?.sum
                ? responseUserCard.current_balance - repaymentRow?.[0]?.sum
                : responseUserCard.current_balance;
              responseUserCard.repayment_paid = responseUserCard.paid_amount ? true : false;
            }
            return responseUserCard;
          })
        ).then((responseUserCard) => {
          responseData.card_details = responseUserCard;
        });
      }
      // Accounts info.
      var resultUserAccounts = await DBManager.runQuery(
        `SELECT user_overdraft_account_id, _user_id, user_overdraft_account_master._bank_id, truelayer_account_id, account_details, overdraft_catalog_master.interest_rate FROM user_overdraft_account_master 
                LEFT JOIN overdraft_catalog_master ON user_overdraft_account_master._bank_id = overdraft_catalog_master._bank_id WHERE _user_id = '${userId}' AND user_overdraft_account_master.is_deleted = 0 AND overdraft_catalog_master.is_deleted = 0`
      );
      var rowUserAccounts = resultUserAccounts?.rows || [];
      if (rowUserAccounts && rowUserAccounts.length) {
        await Promise.all(
          rowUserAccounts.map(async (userAccount) => {
            var decryptAccountDetails = utils.decryptData(userAccount.account_details);
            let responseUserAccount = {
              user_overdraft_account_id: userAccount?.user_overdraft_account_id,
              bank_id: userAccount?._bank_id,
              interest_rate: userAccount?.interest_rate || "",
              currency: decryptAccountDetails.currency || "",
              account_number: decryptAccountDetails.account_number || {},
              available_balance: decryptAccountDetails.balance_info?.available || "",
              original_balance: decryptAccountDetails.original_balance || "",
              current_balance: decryptAccountDetails.balance_info?.current || "",
              overdraft: decryptAccountDetails.balance_info?.overdraft || 0,
              repayment_paid: false,
              paid_amount: 0,
              ...decryptAccountDetails.provider,
            };
            var repaymentResult =
              await DBManager.runQuery(`SELECT SUM(paid_amount), ( SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and
                             platform_card_account_id = '${userAccount.truelayer_account_id}' and month_name = '${moment()
                .utc()
                .format(monthFormat)}' AND
                             is_deleted = 0) FROM user_repayment_master WHERE _user_id = '${userId}' and platform_card_account_id = '${
                userAccount.truelayer_account_id
              }' AND is_deleted = 0`);
            var repaymentRow = repaymentResult?.rows || [];
            if (repaymentRow && repaymentRow.length) {
              responseUserAccount.paid_amount = repaymentRow?.[0]?.paid_amount || responseUserAccount.paid_amount;
              responseUserAccount.current_balance = repaymentRow?.[0]?.sum
                ? responseUserAccount.current_balance - repaymentRow?.[0]?.sum
                : responseUserAccount.current_balance;
              responseUserAccount.repayment_paid = responseUserAccount.paid_amount ? true : false;
            }
            return responseUserAccount;
          })
        ).then((responseUserAccount) => {
          responseData.overdraft_account_details = responseUserAccount;
        });
      }
      // Klarna account info.
      var resultKlarnaAccounts = await DBManager.runQuery(
        `SELECT klarna_id, bnpl_id, bnpl_name, interest_rate, fix_amount, klarna_account_id, price_of_purchase, remaining_balance, interest_free_period, payment_schedule, repayment_plan_left_months FROM user_klarna_account_master LEFT JOIN bnpl_provider_master ON user_klarna_account_master._bnpl_id = bnpl_provider_master.bnpl_id AND user_klarna_account_master.is_deleted = bnpl_provider_master.is_deleted WHERE _user_id = '${userId}' AND user_klarna_account_master.is_deleted = 0`
      );
      var rowklarnaAccounts = resultKlarnaAccounts?.rows || [];
      if (rowklarnaAccounts && rowklarnaAccounts.length) {
        responseData.klarna_accounts = rowklarnaAccounts;
      }
      response.data = responseData;
      response.status = true;
      response.message = "All Cards Accounts Info Listed Successfully.";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to mark monthly payment of users card, overdraft and klarna.
  markRepayment: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { userId } = req.user;
      await validate.checkRepaymentData(apiData);
      if (parseInt(apiData.suggested_balance) < parseInt(apiData.amount)) {
        response.status = false;
        response.message = "Pay amount is more than suggested balance.";
        return responseHelper.respondSuccess(res, 200, response);
      }
      if (parseInt(apiData.suggested_balance) > parseInt(apiData.amount)) {
        response.status = false;
        response.message = "Pay amount is less than suggested balance.";
        return responseHelper.respondSuccess(res, 200, response);
      }
      // if (parseInt(apiData.current_balance) < parseInt(apiData.amount)) {
      //     response.status = false;
      //     response.message = "Pay amount is more than its required.";
      //     return responseHelper.respondSuccess(res, 200, response);
      // }
      // if (parseInt(apiData.amount) < parseInt(apiData.minimum_repayment)) {
      //     response.status = false;
      //     response.message = "Pay amount is less than minimum repayment.";
      //     return responseHelper.respondSuccess(res, 200, response);
      // }
      // Check user marked monthly repayment.
      if (apiData.account_type == "credit card" || apiData.account_type == "overdraft") {
        var repaymentResult = await DBManager.getData("user_repayment_master", "user_repayment_id", {
          _user_id: userId,
          _user_card_account_id: apiData.user_card_account_id,
          account_type: apiData.account_type,
          month_name: moment.utc().format(monthFormat),
        });
        var repaymentRow = repaymentResult?.rows || [];
        if (repaymentRow && repaymentRow.length) {
          await DBManager.dataUpdate(
            "user_repayment_master",
            { paid_amount: apiData.amount },
            {
              _user_id: userId,
              _user_card_account_id: apiData.user_card_account_id,
              account_type: apiData.account_type,
              month_name: moment.utc().format(monthFormat),
            }
          );
          response.status = true;
          response.message = "Repayment Amount Updated Successfully.";
          return responseHelper.respondSuccess(res, 200, response);
        } else {
          var insertData = {
            _user_id: userId,
            _user_card_account_id: apiData.user_card_account_id,
            account_type: apiData.account_type,
            paid_amount: apiData.amount,
            month_name: moment.utc().format(monthFormat),
          };
          await DBManager.dataInsert("user_repayment_master", insertData);
          response.status = true;
          response.message = "Repayment Amount Marked Successfully.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        var repaymentResult = await DBManager.getData("user_repayment_master", "user_repayment_id", {
          _user_id: userId,
          bnpl_platform_id: apiData.bnpl_platform_id,
          month_name: moment.utc().format(monthFormat),
        });
        var repaymentRow = repaymentResult?.rows || [];
        if (repaymentRow && repaymentRow.length) {
          await DBManager.dataUpdate(
            "user_repayment_master",
            { paid_amount: apiData.amount },
            {
              _user_id: userId,
              bnpl_platform_id: apiData.bnpl_platform_id,
              month_name: moment.utc().format(monthFormat),
            }
          );
          var klarnaResult = await DBManager.getData("user_klarna_account_master", "*", { klarna_id: apiData.bnpl_platform_id });
          klarnaRow = klarnaResult?.rows || [];
          if (klarnaRow && klarnaRow.length) {
            klarnaRow = klarnaRow?.[0] || {};
            if (klarnaRow.payment_schedule == "Pay in 30 days") {
              klarnaRow.payment_installments_details.payment_completed = true;
            } else if (klarnaRow.payment_schedule == "Pay in 3 installments") {
              var installments = klarnaRow?.payment_installments_details?.installments || [];
              if (installments && installments.length) {
                installments = _.filter(installments, (row) => {
                  if (moment(row.installments_date).utc().format(monthFormat) == moment().utc().format(monthFormat)) {
                    row.completed = true;
                  }
                });
              }
            }
            await DBManager.dataUpdate(
              "user_klarna_account_master",
              {
                payment_installments_details: JSON.stringify(klarnaRow.payment_installments_details),
              },
              { klarna_id: apiData.bnpl_platform_id }
            );
          }
          response.status = true;
          response.message = "Repayment Amount Updated Successfully.";
          return responseHelper.respondSuccess(res, 200, response);
        } else {
          var insertData = {
            _user_id: userId,
            bnpl_platform_id: apiData.bnpl_platform_id,
            account_type: apiData.account_type,
            paid_amount: apiData.amount,
            month_name: moment.utc().format(monthFormat),
          };
          await DBManager.dataInsert("user_repayment_master", insertData);
          var klarnaResult = await DBManager.getData("user_klarna_account_master", "*", { klarna_id: apiData.bnpl_platform_id });
          klarnaRow = klarnaResult?.rows || [];
          if (klarnaRow && klarnaRow.length) {
            klarnaRow = klarnaRow?.[0] || {};
            if (klarnaRow.payment_schedule == "Pay in 30 days") {
              klarnaRow.payment_installments_details.payment_completed = true;
            } else if (klarnaRow.payment_schedule == "Pay in 3 installments") {
              var installments = klarnaRow?.payment_installments_details?.installments || [];
              if (installments && installments.length) {
                installments = _.filter(installments, (row) => {
                  if (moment(row.installments_date).utc().format(monthFormat) == moment().utc().format(monthFormat)) {
                    row.completed = true;
                  }
                });
              }
            }
            await DBManager.dataUpdate(
              "user_klarna_account_master",
              {
                payment_installments_details: JSON.stringify(klarnaRow.payment_installments_details),
              },
              { klarna_id: apiData.bnpl_platform_id }
            );
          }
          response.status = true;
          response.message = "Repayment Amount Marked Successfully.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get truelayer live details of users overdraft accounts.
  accountDetails: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.query;
      const { userId } = req.user;
      await validate.checkCardAccountId(apiData);
      var resultData = [];
      var responseData = {};
      // Card details.
      if (apiData.user_card_id) {
        resultData =
          await DBManager.runQuery(`SELECT user_card_master.*, card_type_id, card_brand_id, brand_name, brand_image, card_type_name, interest_rate, card_type_image FROM user_card_master
                LEFT JOIN card_brand_type_master on user_card_master."_card_type_id" = card_brand_type_master.card_type_id AND card_brand_type_master.is_deleted = user_card_master.is_deleted
                LEFT JOIN card_brand_master ON card_brand_type_master._card_brand_id = card_brand_master.card_brand_id and card_brand_master.is_deleted = card_brand_type_master.is_deleted
                WHERE _user_id = '${userId}' AND user_card_id = ${apiData.user_card_id} AND user_card_master.is_deleted = 0`);
      }
      // Overdraft account details.
      else if (apiData.user_overdraft_account_id) {
        resultData = await DBManager.runQuery(
          `SELECT user_overdraft_account_id, _user_id, user_overdraft_account_master._bank_id, truelayer_account_id, account_details, overdraft_catalog_master.interest_rate FROM user_overdraft_account_master LEFT JOIN overdraft_catalog_master ON user_overdraft_account_master._bank_id = overdraft_catalog_master._bank_id WHERE _user_id = '${userId}' AND user_overdraft_account_id = ${apiData.user_overdraft_account_id} AND user_overdraft_account_master.is_deleted = 0`
        );
      }
      // Klarna account details.
      else if (apiData.klarna_id) {
        resultData = await DBManager.runQuery(
          `SELECT klarna_id, bnpl_id, bnpl_name, interest_rate, fix_amount, klarna_account_id, price_of_purchase, date_of_purchase, remaining_balance, interest_free_period, payment_schedule, repayment_plan_left_months, payment_installments_details FROM user_klarna_account_master LEFT JOIN bnpl_provider_master ON user_klarna_account_master._bnpl_id = bnpl_provider_master.bnpl_id AND user_klarna_account_master.is_deleted = bnpl_provider_master.is_deleted WHERE _user_id = '${userId}' AND klarna_id = ${apiData.klarna_id} AND user_klarna_account_master.is_deleted = 0`
        );
      }
      var rowData = resultData?.rows || [];
      if (rowData && rowData.length) {
        // User Card detail info.
        if (apiData.user_card_id) {
          var decryptCardDetails = utils.decryptData(rowData[0].card_details);
          if (!rowData[0].truelayer_card_id) {
            responseData = {
              ...rowData[0],
              platform_card_account_id: rowData[0]?.truelayer_card_id || "",
              ...decryptCardDetails,
              approx_monthly_cost:
                decryptCardDetails.current_balance && (decryptCardDetails?.updated_interest_rate || rowData[0]?.custom_interest_rate)
                  ? Math.abs(
                      decryptCardDetails.current_balance *
                        ((decryptCardDetails?.updated_interest_rate || rowData[0]?.custom_interest_rate) / 100 / 12)
                    ).toFixed(2)
                  : "",
              minimum_repayment: utils.createMinimumRepayment(
                Math.abs(decryptCardDetails.current_balance),
                decryptCardDetails?.updated_interest_rate || rowData[0]?.custom_interest_rate
              ),
            };
            delete responseData.card_details;
          } else {
            responseData = {
              user_card_id: rowData?.[0]?.user_card_id,
              bank_id: rowData?.[0]?._bank_id || "",
              platform_card_account_id: rowData[0]?.truelayer_card_id || "",
              display_name: decryptCardDetails.provider?.display_name || "",
              provider_id: decryptCardDetails.provider?.provider_id || "",
              logo_uri: decryptCardDetails.provider?.logo_uri || "",
              currency: decryptCardDetails.currency || "",
              partial_card_number: decryptCardDetails.partial_card_number || "",
              available_balance: decryptCardDetails.available_balance || "",
              original_balance: decryptCardDetails.original_balance || "",
              current_balance: decryptCardDetails.current_balance || "",
              credit_limit: decryptCardDetails.credit_limit || "",
              updated_credit_limit: decryptCardDetails.updated_credit_limit || 0,
              minimum_repayment: decryptCardDetails.minimum_repayment || "",
              card_brand_id: rowData?.[0]?.card_brand_id || "",
              card_type_id: rowData?.[0]?.card_type_id || "",
              card_type_name: rowData?.[0]?.card_type_name || "",
              interest_rate: rowData?.[0]?.interest_rate || "",
              card_type_image: rowData?.[0]?.card_type_image || "",
              custom_brand_type_name: rowData?.[0]?.custom_brand_type_name || "",
              custom_interest_rate: rowData?.[0]?.custom_interest_rate || "",
              estimated_due_date: decryptCardDetails?.estimated_due_date || "",
              updated_estimated_due_date: decryptCardDetails.updated_estimated_due_date || "",
              updated_interest_rate: decryptCardDetails.updated_interest_rate || "",
              updated_minimum_repayment: decryptCardDetails.updated_minimum_repayment || "",
              approx_monthly_cost:
                decryptCardDetails.current_balance &&
                (decryptCardDetails.updated_interest_rate || decryptCardDetails.custom_interest_rate || decryptCardDetails.interest_rate)
                  ? Math.abs(
                      decryptCardDetails.current_balance *
                        ((decryptCardDetails.updated_interest_rate || decryptCardDetails.custom_interest_rate || decryptCardDetails.interest_rate) /
                          100 /
                          12)
                    )
                  : "",
            };
          }

          var repaymentResult =
            await DBManager.runQuery(`SELECT SUM(paid_amount), ( SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and _user_card_account_id = '${
              rowData[0].user_card_id
            }' and   account_type = 'credit card'
                    and month_name = '${moment.utc().format(monthFormat)}' AND is_deleted = 0), 
                    ( SELECT date_created FROM user_card_master WHERE user_card_id = ${apiData.user_card_id} AND is_deleted = 0),
                    ( SELECT date_created as last_month_paid_date FROM user_repayment_master WHERE _user_id = '${userId}' and _user_card_account_id = '${
              rowData[0].user_card_id
            }'  and   account_type = 'credit card'
                    and month_name = '${moment.utc().subtract(1, "months").format(monthFormat)}' AND is_deleted = 0) 
                    FROM user_repayment_master WHERE _user_id = '${userId}' and _user_card_account_id = '${
              rowData[0].user_card_id
            }'  and   account_type = 'credit card' AND is_deleted = 0`);
          var repaymentRow = repaymentResult?.rows || [];
          // responseData.current_balance = repaymentRow && repaymentRow.length ? repaymentRow?.[0]?.sum ? responseData.current_balance - repaymentRow?.[0]?.sum : responseData.current_balance : responseData.current_balance;
          // //  responseData.estimated_due_date = responseData?.estimated_due_date && responseData?.estimated_due_date.length ? responseData?.estimated_due_date : repaymentRow && repaymentRow.length ? repaymentRow?.[0]?.paid_amount ? repaymentRow?.[0]?.last_month_paid_date || '' : repaymentRow?.[0]?.date_created || '' : '';
          responseData.estimated_due_date = responseData.estimated_due_date ? responseData.estimated_due_date : repaymentRow?.[0]?.date_created || "";
          responseData.estimated_due_date = rowData[0]?.estimated_due_date
            ? rowData[0]?.estimated_due_date
            : responseData.estimated_due_date
            ? responseData.estimated_due_date
            : "";
          response.data = responseData;
          response.status = true;
          response.message = "Account Details listed Succesfully.";
          return responseHelper.respondSuccess(res, 200, response);
        }
        // User overdraft account detail info.
        else if (apiData.user_overdraft_account_id) {
          var decryptAccountDetails = utils.decryptData(rowData[0].account_details);
          responseData = {
            user_overdraft_account_id: rowData?.[0]?.user_overdraft_account_id,
            bank_id: rowData?.[0]?._bank_id || "",
            platform_card_account_id: rowData[0]?.truelayer_account_id || "",
            sort_code: decryptAccountDetails?.sort_code || "",
            account_type: decryptAccountDetails?.account_type || "",
            display_name: decryptAccountDetails?.display_name || "",
            custom_interest_rate: decryptAccountDetails?.custom_interest_rate || "",
            interest_rate: rowData?.[0]?.interest_rate || "",
            currency: decryptAccountDetails.currency || "",
            account_number: decryptAccountDetails.account_number || {},
            available_balance: decryptAccountDetails.balance_info?.available || decryptAccountDetails.available_balance || "",
            original_balance: decryptAccountDetails.original_balance || "",
            current_balance: decryptAccountDetails.balance_info?.current || decryptAccountDetails.current_balance || "",
            overdraft: decryptAccountDetails.balance_info?.overdraft || decryptAccountDetails.overdraft || 0,
            updated_interest_rate: decryptAccountDetails.updated_interest_rate || "",
            updated_overdraft_limit: decryptAccountDetails?.updated_overdraft_limit || 0,
            approx_monthly_cost:
              decryptAccountDetails.current_balance &&
              (decryptAccountDetails.updated_interest_rate || decryptAccountDetails.custom_interest_rate || decryptAccountDetails.interest_rate)
                ? Math.abs(
                    decryptAccountDetails.current_balance *
                      ((decryptAccountDetails.updated_interest_rate ||
                        decryptAccountDetails.custom_interest_rate ||
                        decryptAccountDetails.interest_rate) /
                        100 /
                        12)
                  )
                : "",
            ...decryptAccountDetails.provider,
          };
          // var repaymentResult =
          //   await DBManager.runQuery(`SELECT SUM(paid_amount), ( SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and _user_card_account_id = '${
          //     rowData[0].user_overdraft_account_id
          //   }'  and   account_type = 'overdraft'
          //           and month_name = '${moment
          //             .utc()
          //             .format(
          //               monthFormat
          //             )}' AND is_deleted = 0) FROM user_repayment_master WHERE _user_id = '${userId}' and _user_card_account_id = '${
          //     rowData[0].user_overdraft_account_id
          //   }' and   account_type = 'overdraft' AND is_deleted = 0`);
          // var repaymentRow = repaymentResult?.rows || [];
          // if (repaymentRow && repaymentRow.length) {
          //   responseData.current_balance = repaymentRow?.[0]?.sum
          //     ? responseData.current_balance - repaymentRow?.[0]?.sum
          //     : responseData.current_balance;
          // }
          response.data = responseData;
          response.status = true;
          response.message = "Account Details listed Succesfully.";
          return responseHelper.respondSuccess(res, 200, response);
        }
        // User klarna account detail info.
        else if (apiData.klarna_id) {
          let { payment_installments_details, ...responseData } = rowData[0];
          responseData = {
            ...responseData,
            ...payment_installments_details,
          };
          var repaymentResult =
            await DBManager.runQuery(`SELECT SUM(paid_amount), ( SELECT paid_amount FROM user_repayment_master WHERE _user_id = '${userId}' and bnpl_platform_id = '${
              rowData[0].klarna_id
            }'
                    and month_name = '${moment.utc().format(monthFormat)}' AND is_deleted = 0), 
                    ( SELECT date_created FROM user_klarna_account_master WHERE  klarna_id = '${rowData[0].klarna_id}' AND is_deleted = 0),
                    ( SELECT date_created as last_month_paid_date FROM user_repayment_master WHERE _user_id = '${userId}' and bnpl_platform_id = '${
              rowData[0].klarna_id
            }'
                    and month_name = '${moment.utc().subtract(1, "months").format(monthFormat)}' AND is_deleted = 0) 
                    FROM user_repayment_master WHERE _user_id = '${userId}' and bnpl_platform_id = '${rowData[0].klarna_id}' AND is_deleted = 0`);
          var repaymentRow = repaymentResult?.rows || [];
          responseData.current_balance =
            repaymentRow && repaymentRow.length
              ? repaymentRow?.[0]?.sum
                ? responseData.current_balance - repaymentRow?.[0]?.sum
                : responseData.current_balance
              : responseData.current_balance;
          responseData.estimated_due_date = rowData[0]?.payment_installments_details?.estimated_due_date
            ? rowData[0]?.payment_installments_details?.estimated_due_date
            : repaymentRow && repaymentRow.length
            ? repaymentRow?.[0]?.paid_amount
              ? repaymentRow?.[0]?.last_month_paid_date || ""
              : repaymentRow?.[0]?.date_created || ""
            : "";
          var installmentsData = responseData?.payment_installments_details?.installments || [];
          responseData.paid_amount = repaymentRow && repaymentRow.length ? repaymentRow?.[0]?.sum : 0;
          responseData.repayment_paid = responseData.paid_amount ? true : false;
          let resultData = await klarnaHelper.checkKlarnaPayments(userId, apiData.klarna_id, responseData);
          response.data = resultData.status ? resultData.data : responseData;
          response.status = true;
          response.message = "Account Details Listed Succesfully.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        response.status = true;
        response.message = "Account Details Not Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update users monthly pay amount.
  payAmountUpdate: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.query;
      const { userId } = req.user;
      await validate.checkPayAmountData(apiData);
      var repaymentResult = await DBManager.getData("user_repayment_master", "user_repayment_id", {
        _user_id: userId,
        month_name: moment.utc().format(monthFormat),
      });
      var repaymentRow = repaymentResult?.rows || [];
      var debtCalculationResult = await DBManager.getData(
        "superfi_user_debt_record_master",
        "superfi_debt_calculation_id, method_type, superfi_debt_calculation_details",
        { _user_id: userId, method_type: apiData.method_type }
      );
      var debtCalculationRow = debtCalculationResult?.rows || [];
      if (debtCalculationRow && debtCalculationRow.length) {
        if (apiData.method_type == "avalanche") {
          debtCalculationRow[0].superfi_debt_calculation_details.avalanche.original_pay_amount = apiData.pay_amount;
          await DBManager.dataUpdate(
            "superfi_user_debt_record_master",
            {
              superfi_debt_calculation_details: JSON.stringify(debtCalculationRow?.[0]?.superfi_debt_calculation_details),
            },
            {
              superfi_debt_calculation_id: debtCalculationRow?.[0]?.superfi_debt_calculation_id,
            }
          );
          response.status = true;
          response.message = "Pay Amount Updated And Debt Recalculated Successfully.";
          return responseHelper.respondSuccess(res, 200, response);
        } else if (apiData.method_type == "snowball") {
          debtCalculationRow[0].superfi_debt_calculation_details.snowball.original_pay_amount = apiData.pay_amount;
          await DBManager.dataUpdate(
            "superfi_user_debt_record_master",
            {
              superfi_debt_calculation_details: JSON.stringify(debtCalculationRow?.[0]?.superfi_debt_calculation_details),
            },
            {
              superfi_debt_calculation_id: debtCalculationRow?.[0]?.superfi_debt_calculation_id,
            }
          );
          response.status = true;
          response.message = "Pay Amount Updated And Debt Recalculated Successfully.";
          return responseHelper.respondSuccess(res, 200, response);
        }
        // if (apiData.method_type == 'avalanche') {
        //     var cardsAccounts = debtCalculationRow?.[0]?.superfi_debt_calculation_details?.avalanche?.cards_accounts || [];
        //     if (cardsAccounts && cardsAccounts.length) {
        //         var resultNonSuperfi = await superfiHelper.nonSuperfiCalculation(cardsAccounts);
        //         var resultAvalanche = await superfiHelper.avalancheCalculation(apiData.pay_amount, cardsAccounts);
        //         if (resultAvalanche.status) {
        //             resultAvalanche.data.original_pay_amount = apiData.pay_amount;
        //             await DBManager.dataUpdate("superfi_user_debt_record_master", { superfi_debt_calculation_details: JSON.stringify({ avalanche: resultAvalanche.data, nonsuperfi: resultNonSuperfi.data }) }, { superfi_debt_calculation_id: debtCalculationRow?.[0]?.superfi_debt_calculation_id });
        //             response.status = resultAvalanche.status;
        //             response.message = "Pay Amount Updated And Debt Recalculated Successfully.";
        //             return responseHelper.respondSuccess(res, 200, response);
        //         } else {
        //             response.message = resultAvalanche?.message || "Avalanche Debt Not Calculated.";
        //             return responseHelper.respondSuccess(res, 200, response);
        //         }
        //     } else {
        //         response.message = resultAvalanche?.message || "Card And Accounts Not Found.";
        //         return responseHelper.respondSuccess(res, 200, response);
        //     }
        // } else if (apiData.method_type == 'snowball') {
        //     var cardsAccounts = debtCalculationRow?.[0]?.superfi_debt_calculation_details?.snowball?.cards_accounts || [];
        //     if (cardsAccounts && cardsAccounts.length) {
        //         var resultNonSuperfi = await superfiHelper.nonSuperfiCalculation(cardsAccounts);
        //         var resultSnowball = await superfiHelper.snowballCalculation(apiData.pay_amount, cardsAccounts);
        //         if (resultSnowball.status) {
        //             resultSnowball.data.original_pay_amount = apiData.pay_amount;
        //             await DBManager.dataUpdate("superfi_user_debt_record_master", { superfi_debt_calculation_details: JSON.stringify({ snowball: resultSnowball.data, nonsuperfi: resultNonSuperfi.data }) }, { superfi_debt_calculation_id: debtCalculationRow?.[0]?.superfi_debt_calculation_id });
        //             response.status = resultSnowball.status;
        //             response.message = "Pay Amount Updated And Debt Recalculated Successfully.";
        //             return responseHelper.respondSuccess(res, 200, response);
        //         } else {
        //             response.message = resultSnowball?.message || "Snowball Debt Not Calculated.";
        //             return responseHelper.respondSuccess(res, 200, response);
        //         }
        //     } else {
        //         response.message = resultSnowball?.message || "Card And Accounts Not Found.";
        //         return responseHelper.respondSuccess(res, 200, response);
        //     }
        // } else {
        //     response.message = 'Method Type Not Valid.';
        //     return responseHelper.respondSuccess(res, 200, response);
        // }
      } else {
        response.status = true;
        response.message = "Debt Calculation Data Not Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update users cards and klarna payment due date.
  paymentDueDateUpdate: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      await validate.checkPaymentDueDateData(apiData);
      if (apiData.user_card_id) {
        var cardResult = await DBManager.getData("user_card_master", "card_details", { user_card_id: apiData.user_card_id });
        var cardRow = cardResult?.rows || [];
        if (cardRow && cardRow.length) {
          var decryptCardDetails = utils.decryptData(cardRow[0].card_details);
          var cardDetails = decryptCardDetails || {};
          if (cardDetails) {
            cardDetails.updated_estimated_due_date = apiData.due_date;
            await DBManager.dataUpdate(
              "user_card_master",
              { card_details: await utils.encryptData(cardDetails) },
              { user_card_id: apiData.user_card_id }
            );
            response.status = true;
            response.message = "Payment Due Date Updated.";
            return responseHelper.respondSuccess(res, 200, response);
          } else {
            response.status = true;
            response.message = "Card Account Details Not Found.";
            return responseHelper.respondSuccess(res, 200, response);
          }
        } else {
          response.status = true;
          response.message = "Card Account Not Found.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else if (apiData.klarna_id) {
        var klarnaResult = await DBManager.getData("user_klarna_account_master", "*", { klarna_id: apiData.klarna_id });
        var klarnaRow = klarnaResult?.rows || [];
        if (klarnaRow && klarnaRow.length) {
          var klarnaDetails = klarnaRow?.[0]?.payment_installments_details || {};
          if (klarnaDetails) {
            klarnaDetails.estimated_due_date = apiData.due_date;
            await DBManager.dataUpdate(
              "user_klarna_account_master",
              { payment_installments_details: JSON.stringify(klarnaDetails) },
              { klarna_id: apiData.klarna_id }
            );
            response.status = true;
            response.message = "Payment Due Date Updated.";
            return responseHelper.respondSuccess(res, 200, response);
          } else {
            response.status = true;
            response.message = "Klarna Account Details Not Found.";
            return responseHelper.respondSuccess(res, 200, response);
          }
        } else {
          response.status = true;
          response.message = "Klarna Account Not Found.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update monthly minimum pay towards cards.
  minimumRepaymentUpdate: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      await validate.checkMinimumRepaymentData(apiData);
      var cardResult = await DBManager.getData("user_card_master", "card_details", { user_card_id: apiData.user_card_id });
      var cardRow = cardResult?.rows || [];
      if (cardRow && cardRow.length) {
        var decryptCardDetails = utils.decryptData(cardRow[0].card_details);
        var cardDetails = decryptCardDetails || {};
        if (cardDetails) {
          cardDetails.updated_minimum_repayment = apiData.minimum_repayment;
          await DBManager.dataUpdate(
            "user_card_master",
            { card_details: await utils.encryptData(cardDetails) },
            { user_card_id: apiData.user_card_id }
          );
          response.status = true;
          response.message = "Minimum Repayment Updated.";
          return responseHelper.respondSuccess(res, 200, response);
        } else {
          response.status = true;
          response.message = "Card Account Details Not Found.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        response.status = true;
        response.message = "Card Account Not Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update card and overdraft account interest rate.
  interestRateUpdate: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      await validate.checkInterestRateData(apiData);
      if (apiData.user_card_id) {
        var resultCard = await DBManager.getData("user_card_master", "user_card_id, card_details", { user_card_id: apiData.user_card_id });
        var rowCard = resultCard?.rows || [];
        if (rowCard && rowCard.length) {
          var decryptCardDetails = utils.decryptData(rowCard[0].card_details);
          var cardDetails = decryptCardDetails;
          cardDetails.updated_interest_rate = apiData.interest_rate;
          await DBManager.dataUpdate(
            "user_card_master",
            { card_details: await utils.encryptData(cardDetails) },
            { user_card_id: apiData.user_card_id }
          );
          response.status = true;
          response.message = "Interest Rate Updated.";
          return responseHelper.respondSuccess(res, 200, response);
        } else {
          response.status = true;
          response.message = "User Card Not Found.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      }
      if (apiData.user_overdraft_account_id) {
        var resultAccount = await DBManager.getData("user_overdraft_account_master", "user_overdraft_account_id, account_details", {
          user_overdraft_account_id: apiData.user_overdraft_account_id,
        });
        var rowAccount = resultAccount?.rows || [];
        if (rowAccount && rowAccount.length) {
          var accountDetails = utils.decryptData(rowAccount[0].account_details);
          accountDetails.updated_interest_rate = apiData.interest_rate;
          await DBManager.dataUpdate(
            "user_overdraft_account_master",
            { account_details: await utils.encryptData(accountDetails) },
            { user_overdraft_account_id: apiData.user_overdraft_account_id }
          );
          response.status = true;
          response.message = "Interest Rate Updated.";
          return responseHelper.respondSuccess(res, 200, response);
        } else {
          response.status = true;
          response.message = "User Card Not Found.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      }
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to add credit / overdraft(debit) account manually.
  addCreditOverdraftAccounts: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { userId } = req.user;
      await validate.checkCardAccountData(apiData);
      const { account_type } = apiData;
      if (account_type == "credit card") {
        let dataObj = {
          _user_id: userId,
          card_details: utils.encryptData({
            approx_monthly_cost:
              apiData.current_balance && apiData.interest_rate ? Math.abs(apiData.current_balance * (apiData.interest_rate / 100 / 12)) : "",
            initial_minimum_repayment: utils.createMinimumRepayment(Math.abs(apiData.current_balance), apiData.interest_rate),
            minimum_repayment: utils.createMinimumRepayment(Math.abs(apiData.current_balance), apiData.interest_rate),
            account_type: account_type,
            display_name: apiData.provider_name,
            original_balance: apiData.current_balance,
            current_balance: apiData.current_balance,
            card_number: apiData.card_number,
            estimated_due_date: apiData.due_date,
          }),
          custom_interest_rate: apiData.interest_rate,
        };
        await DBManager.dataInsert("user_card_master", dataObj);
      } else if (account_type == "debit card") {
        let dataObj = {
          _user_id: userId,
          account_details: utils.encryptData({
            approx_monthly_cost:
              apiData.current_balance && apiData.interest_rate ? Math.abs(apiData.current_balance * (apiData.interest_rate / 100 / 12)) : "",
            initial_minimum_repayment: utils.createMinimumRepayment(Math.abs(apiData.current_balance), apiData.interest_rate),
            minimum_repayment: utils.createMinimumRepayment(Math.abs(apiData.current_balance), apiData.interest_rate),
            account_type: account_type,
            display_name: apiData.provider_name,
            original_balance: apiData.current_balance,
            current_balance: apiData.current_balance,
            account_number: apiData.account_number,
            sort_code: apiData.sort_code,
            custom_interest_rate: apiData.interest_rate,
          }),
        };
        await DBManager.dataInsert("user_overdraft_account_master", dataObj);
      }
      response.status = true;
      response.message = "Credit / Debit Card Added Successfully.";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to redirect email verification url to application.
  generateVerifyUrl: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      console.log("---------------Starting generate verify link api------------------");
      var apiData = req.query;
      await validate.checkEmail(apiData);
      if (apiData.type == "forgot_passcode") {
        return res.redirect(`superfi://page/login/${apiData.email_id}`);
      }
      if (apiData.type == "welcome_mail") {
        return res.redirect(`superfi://`);
      }
    } catch (error) {
      //console.log(error);
      console.log("auth token error ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update credit limit and overdraft limit.
  accountLimitUpdate: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      await validate.checkCardOverdraftId(apiData);
      if (apiData.user_card_id) {
        var resultCard = await DBManager.getData("user_card_master", "user_card_id, card_details", { user_card_id: apiData.user_card_id });
        var rowCard = resultCard?.rows || [];
        if (rowCard && rowCard.length) {
          var decryptCardDetails = utils.decryptData(rowCard[0].card_details);
          var cardDetails = decryptCardDetails;
          cardDetails.updated_credit_limit = apiData.limit;
          await DBManager.dataUpdate(
            "user_card_master",
            { card_details: await utils.encryptData(cardDetails) },
            { user_card_id: apiData.user_card_id }
          );
          response.status = true;
          response.message = "Credit Limit Updated.";
          return responseHelper.respondSuccess(res, 200, response);
        } else {
          response.status = true;
          response.message = "User Card Not Found.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else if (apiData.user_overdraft_account_id) {
        var resultAccount = await DBManager.getData("user_overdraft_account_master", "user_overdraft_account_id, account_details", {
          user_overdraft_account_id: apiData.user_overdraft_account_id,
        });
        var rowAccount = resultAccount?.rows || [];
        if (rowAccount && rowAccount.length) {
          var accountDetails = utils.decryptData(rowAccount[0].account_details);
          accountDetails.updated_overdraft_limit = apiData.limit;
          await DBManager.dataUpdate(
            "user_overdraft_account_master",
            { account_details: await utils.encryptData(accountDetails) },
            { user_overdraft_account_id: apiData.user_overdraft_account_id }
          );
          response.status = true;
          response.message = "Overdraft Limit Updated.";
          return responseHelper.respondSuccess(res, 200, response);
        } else {
          response.status = true;
          response.message = "User Card Not Found.";
          return responseHelper.respondSuccess(res, 200, response);
        }
      }
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to delete klarna and manual card account.
  deleteAccount: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { userId } = req.user;
      await validate.checkAccountId(apiData);
      var resultAccounts =
        apiData.account_type == "credit card"
          ? await DBManager.getData("user_card_master", "*", {
              _user_id: userId,
              user_card_id: apiData.account_id,
            })
          : apiData.account_type == "overdraft"
          ? await DBManager.getData("user_overdraft_account_master", "*", {
              _user_id: userId,
              user_overdraft_account_id: apiData.account_id,
            })
          : await DBManager.getData("user_klarna_account_master", "*", {
              _user_id: userId,
              klarna_id: apiData.account_id,
            });
      var rowAccounts = resultAccounts?.rows || [];
      if (rowAccounts && rowAccounts.length) {
        if (apiData.account_type == "credit card") {
          await DBManager.dataDelete("user_card_master", {
            _user_id: userId,
            user_card_id: apiData.account_id,
          });
        } else if (apiData.account_type == "overdraft") {
          await DBManager.dataDelete("user_overdraft_account_master", {
            _user_id: userId,
            user_overdraft_account_id: apiData.account_id,
          });
        } else if (apiData.account_type == "klarna") {
          await DBManager.dataDelete("user_klarna_account_master", {
            _user_id: userId,
            klarna_id: apiData.account_id,
          });
        }
        response.status = true;
        response.message = "Account Deleted.";
        return responseHelper.respondSuccess(res, 200, response);
      } else {
        response.status = true;
        response.message = "Account Not Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update balance of manual card account.
  updateAccountBalance: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { userId } = req.user;
      await validate.checkAccountBalance(apiData);
      var resultAccounts = apiData.user_card_id
        ? await DBManager.getData("user_card_master", "*", {
            _user_id: userId,
            user_card_id: apiData.user_card_id,
          })
        : await DBManager.getData("user_overdraft_account_master", "*", {
            _user_id: userId,
            user_overdraft_account_id: apiData.user_overdraft_account_id,
          });
      var rowAccounts = resultAccounts?.rows || [];
      if (rowAccounts && rowAccounts.length) {
        if (apiData.user_card_id) {
          var decryptCard = await utils.decryptData(rowAccounts[0].card_details);
          decryptCard.current_balance = apiData.balance;
          decryptCard.minimum_repayment = utils.createMinimumRepayment(
            Math.abs(apiData.balance),
            decryptCard.updated_interest_rate || rowAccounts[0].custom_interest_rate || rowAccounts[0].interest_rate
          );
          await DBManager.dataUpdate(
            "user_card_master",
            { card_details: await utils.encryptData(decryptCard) },
            { _user_id: userId, user_card_id: apiData.user_card_id }
          );
        } else if (apiData.user_overdraft_account_id) {
          var decryptAccount = await utils.decryptData(rowAccounts[0].account_details);
          decryptAccount.current_balance = apiData.balance;
          decryptAccount.minimum_repayment = utils.createMinimumRepayment(
            Math.abs(apiData.balance),
            decryptAccount.updated_interest_rate || decryptAccount.custom_interest_rate || decryptAccount.interest_rate
          );
          await DBManager.dataUpdate(
            "user_overdraft_account_master",
            { account_details: await utils.encryptData(decryptAccount) },
            {
              _user_id: userId,
              user_overdraft_account_id: apiData.user_overdraft_account_id,
            }
          );
        }
        response.status = true;
        response.message = "Balance Updated";
        return responseHelper.respondSuccess(res, 200, response);
      } else {
        response.status = true;
        response.message = "Account Not Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get monthly income and expenditure data.
  incomeAndExpenditureDetails: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { userId } = req.user;
      var income = 0;
      var expenditure = 0;
      var resultUserCards = await DBManager.runQuery(
        `SELECT user_card_master.* FROM user_card_master LEFT JOIN user_bank_account_master ON user_card_master._user_id = user_bank_account_master._user_id AND user_card_master._bank_id = user_bank_account_master._bank_id WHERE user_card_master._user_id = '${userId}' AND user_card_master.is_deleted = 0 AND user_bank_account_master.is_token_expired = 0`
      );
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
              var resultToken = await _.find(tokens, {
                bank_id: rowData._bank_id,
              });
              resultToken = resultToken.token;
              var rowToken = resultToken?.data || [];
              if (resultToken.status) {
                let startDate = moment().subtract(1, "months").startOf("month").format("YYYY-MM-DD");
                let endDate = moment().subtract(1, "months").endOf("month").format("YYYY-MM-DD");
                var resultTransaction = await axios.request({
                  method: "get",
                  url: decodeURI(
                    `${config.TRUELAYER_API_BASE_URL}/data/v1/cards/${rowData.truelayer_card_id}/transactions?from=${startDate}&to=${endDate}`
                  ),
                  headers: {
                    "content-type": "application/x-www-form-urlencoded",
                    Authorization: `Bearer ${rowToken.access_token}`,
                  },
                });
                var rowTransaction = resultTransaction?.data?.results || [];

                await Promise.all(
                  rowTransaction.map(async (row) => {
                    if (row.transaction_type == "DEBIT") {
                      expenditure = expenditure + Math.abs(row.amount);
                    }
                  })
                );
              }
            })
          );
        });
      }

      var resultAccounts = await DBManager.runQuery(
        `SELECT user_overdraft_account_master.* FROM user_overdraft_account_master LEFT JOIN user_bank_account_master ON user_bank_account_master._user_id = user_overdraft_account_master._user_id AND user_bank_account_master._bank_id = user_overdraft_account_master._bank_id WHERE user_overdraft_account_master._user_id = '${userId}' AND user_overdraft_account_master.is_deleted = 0 AND user_bank_account_master.is_token_expired = 0`
      );
      var rowAccount = resultAccounts.rows || [];
      if (rowAccount && rowAccount.length) {
        var rowBankId = await _.uniqBy(rowAccount, "_bank_id");
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
            rowAccount.map(async (rowData) => {
              var resultToken = await _.find(tokens, {
                bank_id: rowData._bank_id,
              });
              resultToken = resultToken.token;
              var rowToken = resultToken?.data || [];
              var rowTransaction = [];
              if (resultToken.status) {
                let startDate = moment().subtract(1, "months").startOf("month").format("YYYY-MM-DD");
                let endDate = moment().subtract(1, "months").endOf("month").format("YYYY-MM-DD");
                var resultTransaction = await axios.request({
                  method: "get",
                  url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts/${rowData.truelayer_account_id}/transactions?from=${startDate}&to=${endDate}`,
                  headers: {
                    "content-type": "application/x-www-form-urlencoded",
                    Authorization: `Bearer ${rowToken.access_token}`,
                  },
                });
                rowTransaction = resultTransaction?.data?.results || [];

                await Promise.all(
                  rowTransaction.map(async (row) => {
                    if (row.transaction_type == "CREDIT" && row.transaction_category != "PURCHASE") {
                      income = income + Math.abs(row.amount);
                    } else if (row.transaction_type == "DEBIT") {
                      expenditure = expenditure + Math.abs(row.amount);
                    }
                  })
                );
              }
            })
          );
        });
      }
      response.status = true;
      response.message = "Income and Expenditure Data!";
      response.data = {
        income: income.toFixed(2),
        expenditure: expenditure.toFixed(2),
      };
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
};
