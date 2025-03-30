var config = require("./../config/config");
const validate = require("../validations/klarna.validation");
const responseHelper = require("./../common/responseHelper");
const truelayerHelper = require("./../common/truelayer");
const klarnaHelper = require("./../common/klarna");
const DB = require("./../common/dbmanager");
const axios = require("axios").default;
const DBManager = new DB();
const _ = require("lodash");
const moment = require("moment");
const monthFormat = "YYYY-MM";
const dateFormat = "YYYY-MM-DD HH:mm:ss";
const utils = require("./../common/utils");
const Sentry = require("@sentry/node");

module.exports = {
  // This function is used to save users klarna information.
  saveCustomKlarnaInfo: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { userId } = req.user;
      await validate.checkKlarnaData(apiData);
      var resultBnpl = await DBManager.getData("bnpl_provider_master", "bnpl_id, bnpl_name, interest_rate, fix_amount", { bnpl_name: "klarna" });
      var rowBnpl = resultBnpl?.rows || [];
      if (rowBnpl && rowBnpl.length) {
        var insertData = {
          _user_id: userId,
          _bnpl_id: rowBnpl?.[0]?.bnpl_id,
          price_of_purchase: apiData?.price_of_purchase,
          payment_schedule: apiData?.payment_schedule,
          date_of_purchase: apiData?.date_of_purchase || null,
          payment_installments_details:
            apiData.initial_payment && apiData.installments
              ? JSON.stringify({
                  current_balance: apiData?.price_of_purchase,
                  initial_payment: apiData.initial_payment,
                  installments: apiData.installments,
                  card_account_details: {
                    ...apiData?.card_account_details,
                    minimum_repayment: utils.createMinimumRepayment(apiData.price_of_purchase, rowBnpl[0].interest_rate),
                  },
                })
              : JSON.stringify({
                  payment_completed: apiData?.payment_completed,
                  current_balance: apiData?.price_of_purchase,
                  card_account_details: { ...apiData?.card_account_details },
                }),
        };
        await DBManager.dataInsert("user_klarna_account_master", insertData);
        response.status = true;
        response.message = "klarna Info Saved Successfully.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get users klara information.
  klarnaInfo: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { userId } = req.user;
      const { information_type } = req.query;

      var resultKlarnaAccounts = await DBManager.runQuery(
        `SELECT klarna_id, bnpl_id, bnpl_name, interest_rate, fix_amount, klarna_id, price_of_purchase, payment_schedule, date_of_purchase, payment_installments_details FROM user_klarna_account_master LEFT JOIN bnpl_provider_master ON user_klarna_account_master._bnpl_id = bnpl_provider_master.bnpl_id AND user_klarna_account_master.is_deleted = bnpl_provider_master.is_deleted WHERE _user_id = '${userId}' AND user_klarna_account_master.is_deleted = 0`
      );
      var rowklarnaAccounts = resultKlarnaAccounts?.rows || [];
      var responseData = [];
      let returnResponse = [];
      if (rowklarnaAccounts && rowklarnaAccounts.length) {
        await Promise.all(
          rowklarnaAccounts.map(async (klarnaAccount) => {
            let klarnaData = {
              klarna_id: klarnaAccount?.klarna_id,
              bnpl_id: klarnaAccount?.bnpl_id,
              bnpl_name: klarnaAccount?.bnpl_name,
              interest_rate: klarnaAccount?.interest_rate,
              fix_amount: klarnaAccount?.fix_amount,
              price_of_purchase: klarnaAccount?.price_of_purchase,
              payment_schedule: klarnaAccount?.payment_schedule,
              date_of_purchase: klarnaAccount?.date_of_purchase || "",
              payment_completed: klarnaAccount?.payment_installments_details?.payment_completed || false,
              initial_payment: klarnaAccount?.payment_installments_details?.initial_payment || {},
              installments: klarnaAccount?.payment_installments_details?.installments || {},
              card_account_details: klarnaAccount?.payment_installments_details?.card_account_details || {},
            };
            if (information_type != "local") {
              let resultData = await klarnaHelper.checkKlarnaPayments(userId, klarnaAccount.klarna_id, klarnaData);
              if (resultData.status) {
                klarnaData = resultData.data;
                returnResponse.push(resultData.data);
              }
            }

            var repaymentResult = await DBManager.getData("user_repayment_master", "bnpl_platform_id, paid_amount", {
              _user_id: userId,
              bnpl_platform_id: klarnaAccount.klarna_id,
              account_type: "klarna",
              month_name: `${moment.utc().format(monthFormat)}`,
            });
            var repaymentRow = repaymentResult?.rows || [];
            klarnaData.paid_amount = repaymentRow?.[0]?.paid_amount || 0;
            klarnaData.repayment_paid = klarnaData.paid_amount ? true : false;
            if (klarnaData.payment_schedule == "Pay in 30 days") {
              let estimatedDueDate = moment(klarnaData.date_of_purchase, dateFormat).utc().add(30, "d");
              let currentDate = moment().utc().format(dateFormat);
              if (!klarnaData.payment_completed || (currentDate <= estimatedDueDate && currentDate >= klarnaData.date_of_purchase)) {
                if (!_.filter(responseData, { klarna_id: klarnaData.klarna_id }).length) {
                  responseData.push(klarnaData);
                }
              }
            } else if (klarnaData.payment_schedule == "Pay in 3 installments") {
              let currentMonth = moment().utc().format(monthFormat);
              await Promise.all(
                klarnaData.installments.map(async (row) => {
                  if (!row.completed || moment(row.installments_date).format(monthFormat) == currentMonth) {
                    if (!_.filter(responseData, { klarna_id: klarnaData.klarna_id }).length) {
                      responseData.push(klarnaData);
                    }
                  }
                })
              );
            }
          })
        );
      }
      response.data = responseData;
      response.status = true;
      response.message = "Klarna Accounts Info Listed Successfully.";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      Sentry.captureException(error);
      console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get users klarna transaction from users connected accounts.
  klarnaTransaction: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { userId } = req.user;
      var responseData = {};
      // Card transaction data
      var resultCards = await DBManager.runQuery(
        `SELECT user_card_master.* FROM user_card_master LEFT JOIN user_bank_account_master ON user_card_master._user_id = user_bank_account_master._user_id AND user_card_master._bank_id = user_bank_account_master._bank_id WHERE user_card_master._user_id = '${userId}' AND user_card_master.is_deleted = 0 AND user_bank_account_master.is_token_expired = 0`
      );
      //    var resultCards = await DBManager.getData("user_card_master", "*", { _user_id: userId });
      var rowCards = resultCards.rows || [];
      if (rowCards && rowCards.length) {
        var rowBankId = await _.uniqBy(rowCards, "_bank_id");
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
            rowCards.map(async (rowData) => {
              var decryptCardDetails = utils.decryptData(rowData.card_details);
              var resultToken = await _.find(tokens, { bank_id: rowData._bank_id });
              resultToken = resultToken.token;
              var rowToken = resultToken?.data || [];
              var resultKlarnaTransaction = await DBManager.getData("user_klarna_transaction", "*", {
                _user_id: userId,
                card_account_id: rowData.user_card_id,
                account_type: "credit",
              });
              var rowKlarnaTransaction = resultKlarnaTransaction?.rows || [];
              var responseData = {
                user_card_id: rowData?.user_card_id,
                account_type: "credit",
                bank_id: rowData?._bank_id,
                platform_card_account_id: rowData?.truelayer_card_id,
                card_details: {
                  display_name: decryptCardDetails.provider?.display_name || decryptCardDetails.display_name,
                  provider_id: decryptCardDetails.provider?.provider_id || decryptCardDetails.provider_id,
                  logo_uri: decryptCardDetails.provider?.logo_uri || decryptCardDetails.logo_uri,
                },
              };
              if (rowKlarnaTransaction && rowKlarnaTransaction.length) {
                let start_date = rowKlarnaTransaction?.[0]?.end_date;
                let end_date = moment.utc().format(dateFormat);
                var transactionData = rowKlarnaTransaction[0];
                if (start_date != end_date) {
                  if (resultToken.status) {
                    try {
                      var resultTransaction = await axios.request({
                        method: "get",
                        url: `${config.TRUELAYER_API_BASE_URL}/data/v1/cards/${rowData.truelayer_card_id}/transactions?from=${utils.escapeUrl(
                          start_date
                        )}&to=${utils.escapeUrl(end_date)}`,
                        headers: { "content-type": "application/x-www-form-urlencoded", Authorization: `Bearer ${rowToken.access_token}` },
                      });
                    } catch (error) {
                      responseData.transaction_details = transactionData.transaction_details;
                      return responseData;
                    }

                    var rowTransaction = resultTransaction?.data?.results || [];
                    if (rowTransaction && rowTransaction.length) {
                      var klarnaTransaction = _.filter(rowTransaction, { merchant_name: "Klarna" });
                      if (klarnaTransaction && klarnaTransaction.length) {
                        transactionData.transaction_details.push(...klarnaTransaction);
                        await DBManager.dataUpdate(
                          "user_klarna_transaction",
                          { start_date: start_date, end_date: end_date, transaction_details: JSON.stringify(transactionData.transaction_details) },
                          { user_transaction_id: transactionData.user_transaction_id }
                        );
                        responseData.transaction_details = transactionData.transaction_details;
                        return responseData;
                      } else {
                        responseData.transaction_details = transactionData.transaction_details;
                        return responseData;
                      }
                    } else {
                      responseData.transaction_details = transactionData.transaction_details;
                      return responseData;
                    }
                  } else {
                    responseData.transaction_details = transactionData.transaction_details;
                    return responseData;
                  }
                } else {
                  responseData.transaction_details = transactionData.transaction_details;
                  return responseData;
                }
              } else {
                if (resultToken.status) {
                  try {
                    var resultTransaction = await axios.request({
                      method: "get",
                      url: `${config.TRUELAYER_API_BASE_URL}/data/v1/cards/${rowData.truelayer_card_id}/transactions`,
                      headers: { Authorization: `Bearer ${rowToken.access_token} 1` },
                    });
                  } catch (error) {
                    responseData.transaction_details = rowKlarnaTransaction[0] || [];
                    return responseData;
                  }

                  var rowTransaction = resultTransaction?.data?.results || [];
                  if (rowTransaction && rowTransaction.length) {
                    var klarnaTransaction = _.filter(rowTransaction, { merchant_name: "Klarna" });
                    if (klarnaTransaction && klarnaTransaction.length) {
                      let dataObj = {
                        _user_id: userId,
                        platform_card_account_id: rowData.truelayer_card_id,
                        card_account_id: rowData.user_card_id,
                        account_type: "credit",
                        start_date: "",
                        end_date: moment.utc().format(dateFormat),
                        transaction_details: JSON.stringify(klarnaTransaction),
                      };
                      await DBManager.dataInsert("user_klarna_transaction", dataObj);
                      responseData.transaction_details = klarnaTransaction;
                      return responseData;
                    } else {
                      responseData.transaction_details = {};
                      return responseData;
                    }
                  } else {
                    responseData.transaction_details = {};
                    return responseData;
                  }
                } else {
                  responseData.transaction_details = {};
                  return responseData;
                }
              }
            })
          ).then(async (data) => {
            responseData.card_details = data;
          });
        });
      } else {
        responseData.card_details = [];
      }

      // Account transaction data
      var resultAccounts = await DBManager.runQuery(
        `SELECT user_overdraft_account_master.* FROM user_overdraft_account_master LEFT JOIN user_bank_account_master ON user_bank_account_master._user_id = user_overdraft_account_master._user_id AND user_bank_account_master._bank_id = user_overdraft_account_master._bank_id WHERE user_overdraft_account_master._user_id = '${userId}' AND user_overdraft_account_master.is_deleted = 0 AND user_bank_account_master.is_token_expired = 0`
      );
      //   var resultAccounts = await DBManager.getData("user_overdraft_account_master", "*", { _user_id: userId });
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
              var decryptAccountDetails = utils.decryptData(rowData.account_details);
              var resultToken = await _.find(tokens, { bank_id: rowData._bank_id });
              resultToken = resultToken.token;
              var rowToken = resultToken?.data || [];
              var resultKlarnaTransaction = await DBManager.getData("user_klarna_transaction", "*", {
                _user_id: userId,
                card_account_id: rowData.user_overdraft_account_id,
                account_type: "overdraft",
              });
              var rowKlarnaTransaction = resultKlarnaTransaction?.rows || [];
              var responseData = {
                user_overdraft_account_id: rowData?.user_overdraft_account_id,
                account_type: "overdraft",
                bank_id: rowData?._bank_id,
                platform_card_account_id: rowData?.truelayer_account_id,
                card_details: {
                  display_name: decryptAccountDetails.provider?.display_name || decryptAccountDetails.display_name,
                  provider_id: decryptAccountDetails.provider?.provider_id || decryptAccountDetails.provider_id,
                  logo_uri: decryptAccountDetails.provider?.logo_uri || decryptAccountDetails.logo_uri,
                },
              };
              if (rowKlarnaTransaction && rowKlarnaTransaction.length) {
                let start_date = rowKlarnaTransaction?.[0]?.end_date;
                let end_date = moment.utc().format(dateFormat);
                var transactionData = rowKlarnaTransaction[0];
                if (start_date != end_date) {
                  if (resultToken.status) {
                    try {
                      var resultTransaction = await axios.request({
                        method: "get",
                        url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts/${rowData.truelayer_account_id}/transactions?from=${utils.escapeUrl(
                          start_date
                        )}&to=${utils.escapeUrl(end_date)}`,
                        headers: { "content-type": "application/x-www-form-urlencoded", Authorization: `Bearer ${rowToken.access_token} 1` },
                      });
                    } catch (error) {
                      responseData.transaction_details = transactionData.transaction_details || [];
                      return responseData;
                    }

                    var rowTransaction = resultTransaction?.data?.results || [];
                    if (rowTransaction && rowTransaction.length) {
                      var klarnaTransaction = _.filter(rowTransaction, { merchant_name: "Klarna" });
                      if (klarnaTransaction && klarnaTransaction.length) {
                        transactionData.transaction_details.push(...klarnaTransaction);
                        await DBManager.dataUpdate(
                          "user_klarna_transaction",
                          { start_date: start_date, end_date: end_date, transaction_details: JSON.stringify(transactionData.transaction_details) },
                          { user_transaction_id: transactionData.user_transaction_id }
                        );
                        responseData.transaction_details = transactionData.transaction_details;
                        return responseData;
                      } else {
                        responseData.transaction_details = transactionData.transaction_details;
                        return responseData;
                      }
                    } else {
                      responseData.transaction_details = transactionData.transaction_details;
                      return responseData;
                    }
                  } else {
                    responseData.transaction_details = transactionData.transaction_details;
                    return responseData;
                  }
                } else {
                  responseData.transaction_details = transactionData.transaction_details;
                  return responseData;
                }
              } else {
                if (resultToken.status) {
                  try {
                    var resultTransaction = await axios.request({
                      method: "get",
                      url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts/${rowData.truelayer_account_id}/transactions`,
                      headers: { Authorization: `Bearer ${rowToken.access_token} 1` },
                    });
                  } catch (error) {
                    responseData.transaction_details = rowKlarnaTransaction[0] || [];
                    return responseData;
                  }

                  var rowTransaction = resultTransaction?.data?.results || [];
                  if (rowTransaction && rowTransaction.length) {
                    var klarnaTransaction = _.filter(rowTransaction, { merchant_name: "Klarna" });
                    if (klarnaTransaction && klarnaTransaction.length) {
                      let dataObj = {
                        _user_id: userId,
                        platform_card_account_id: rowData.truelayer_account_id,
                        card_account_id: rowData.user_overdraft_account_id,
                        account_type: "overdraft",
                        start_date: "",
                        end_date: moment.utc().format(dateFormat),
                        transaction_details: JSON.stringify(klarnaTransaction),
                      };
                      await DBManager.dataInsert("user_klarna_transaction", dataObj);
                      responseData.transaction_details = klarnaTransaction;
                      return responseData;
                    } else {
                      responseData.transaction_details = {};
                      return responseData;
                    }
                  } else {
                    responseData.transaction_details = {};
                    return responseData;
                  }
                } else {
                  responseData.transaction_details = {};
                  return responseData;
                }
              }
            })
          ).then(async (data) => {
            responseData.account_details = data;
          });
        });
      } else {
        responseData.account_details = [];
      }
      response.data = responseData;
      response.status = true;
      response.message = "Card Account Transaction Listed Successfully.";
      console.log("card account transaction get api response ###############", response);
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      console.log(error);
      console.log("card account transaction get api error ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update klarna completed installments.
  updateCompletedInstallments: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { userId } = req.user;
      await validate.checkKlarnaInstallments(apiData);
      var resultKlarnaAccounts = await DBManager.getData("user_klarna_account_master", "*", { klarna_id: apiData.klarna_id });
      var rowklarnaAccounts = resultKlarnaAccounts?.rows || [];
      if (rowklarnaAccounts && rowklarnaAccounts.length) {
        rowklarnaAccounts[0].payment_installments_details.installments = apiData.installments;
        await DBManager.dataUpdate(
          "user_klarna_account_master",
          { payment_installments_details: JSON.stringify(rowklarnaAccounts[0].payment_installments_details) },
          { klarna_id: apiData.klarna_id }
        );
        var resultDebtCalculation = await DBManager.runQuery(
          `SELECT * FROM superfi_user_debt_record_master WHERE _user_id = '${userId}' ORDER BY date_modified DESC`
        );
        var rowDebtCalculation = resultDebtCalculation?.rows || [];
        if (rowDebtCalculation && rowDebtCalculation.length) {
          var superfiDetails =
            rowDebtCalculation?.[0]?.superfi_debt_calculation_details?.avalanche ||
            rowDebtCalculation?.[0]?.superfi_debt_calculation_details?.snowball;
          var klarnaData = superfiDetails?.non_calculation_accounts || [];
          await Promise.all(
            klarnaData.map(async (rowKlarna) => {
              if (rowKlarna.klarna_id && rowKlarna.klarna_id == apiData.klarna_id) {
                rowKlarna.installments = apiData.installments;
              }
            })
          );
        }
        await DBManager.dataUpdate(
          "superfi_user_debt_record_master",
          { superfi_debt_calculation_details: JSON.stringify(rowDebtCalculation?.[0]?.superfi_debt_calculation_details) },
          { superfi_debt_calculation_id: rowDebtCalculation?.[0]?.superfi_debt_calculation_id }
        );

        response.status = true;
        response.message = "Klarna Installment Updated.";
        return responseHelper.respondSuccess(res, 200, response);
      } else {
        response.status = true;
        response.message = "Klarna Accounts Not Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
};
