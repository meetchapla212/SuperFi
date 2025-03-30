var config = require("./../config/config");
const truelayerHelper = require("./../common/truelayer");
const axios = require("axios").default;
const DB = require("./../common/dbmanager");
const DBManager = new DB();
const moment = require("moment");
const _ = require("lodash");
const dateFormat = "YYYY-MM-DD HH:mm:ss";

// This function is to check user klarna payments from truelayer transactions.
const checkKlarnaPayments = function (userId, klarnaId, data) {
  return new Promise(async (resolve, reject) => {
    try {
      var responseData = {
        ...data,
      };
      var installmentsData = responseData?.installments || [];
      if (responseData.payment_schedule == "Pay in 30 days" && responseData.payment_completed) {
        return resolve({ status: true, data: responseData });
      } else {
        let completedInstallments = installmentsData
          ? _.filter(installmentsData, (row) => {
              if (row.completed) {
                return row;
              }
            })
          : [];
        if (completedInstallments.length == installmentsData.length) {
          return resolve({ status: true, data: responseData });
        }
      }
      var resultCards = await DBManager.runQuery(
        `SELECT user_card_master.* FROM user_card_master LEFT JOIN user_bank_account_master ON user_card_master._user_id = user_bank_account_master._user_id AND user_card_master._bank_id = user_bank_account_master._bank_id WHERE user_card_master._user_id = '${userId}' AND user_card_master.is_deleted = 0 AND user_bank_account_master.is_token_expired = 0`
      );
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
              var resultToken = await _.find(tokens, { bank_id: rowData._bank_id });
              resultToken = resultToken.token;
              var rowToken = resultToken?.data || [];
              var rowTransaction = [];
              if (resultToken.status) {
                var resultTransaction = await axios.request({
                  method: "get",
                  url: `${config.TRUELAYER_API_BASE_URL}/data/v1/cards/${rowData.truelayer_card_id}/transactions`,
                  headers: { "content-type": "application/x-www-form-urlencoded", Authorization: `Bearer ${rowToken.access_token}` },
                });
                rowTransaction = resultTransaction?.data?.results || [];
              } else {
                var resultKlarnaTransaction = await DBManager.getData("user_klarna_transaction", "*", {
                  _user_id: userId,
                  card_account_id: rowData.user_card_id,
                  account_type: "credit",
                });
                rowTransaction = resultKlarnaTransaction?.rows?.[0]?.transaction_details || [];
              }
              if (rowTransaction && rowTransaction.length) {
                if (responseData.payment_schedule == "Pay in 30 days") {
                  var klarnaTransaction = _.filter(rowTransaction, (row) => {
                    if (
                      row.merchant_name == "Klarna" &&
                      Math.abs(row.amount) == responseData.price_of_purchase &&
                      moment(row.timestamp).format(dateFormat) > moment(responseData.date_of_purchase).format(dateFormat) &&
                      moment(row.timestamp).format(dateFormat) < moment(responseData.date_of_purchase).add(30, "d").format(dateFormat)
                    ) {
                      return row;
                    }
                  });
                  if (klarnaTransaction && klarnaTransaction.length) {
                    responseData.payment_completed = true;
                  }
                } else {
                  if (installmentsData && installmentsData.length) {
                    await Promise.all(
                      installmentsData.map(async (installments) => {
                        if (!installments.completed) {
                          var klarnaTransaction = _.filter(rowTransaction, (row) => {
                            if (
                              row.merchant_name == "Klarna" &&
                              Math.abs(row.amount) == installments.installment_amount &&
                              moment(row.timestamp).format("YYYY-MM-DD") == moment(installments.installments_date).format("YYYY-MM-DD")
                            ) {
                              return row;
                            }
                          });
                          if (klarnaTransaction && klarnaTransaction.length) {
                            installments.completed = true;
                          }
                        }
                      })
                    );
                  }
                }
              }
            })
          );
        });
      }

      // Account transaction data
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
              var resultToken = await _.find(tokens, { bank_id: rowData._bank_id });
              resultToken = resultToken.token;
              var rowToken = resultToken?.data || [];
              var rowTransaction = [];
              if (resultToken.status) {
                var resultTransaction = await axios.request({
                  method: "get",
                  url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts/${rowData.truelayer_account_id}/transactions`,
                  headers: { "content-type": "application/x-www-form-urlencoded", Authorization: `Bearer ${rowToken.access_token}` },
                });
                rowTransaction = resultTransaction?.data?.results || [];
              } else {
                var resultKlarnaTransaction = await DBManager.getData("user_klarna_transaction", "*", {
                  _user_id: userId,
                  card_account_id: rowData.user_overdraft_account_id,
                  account_type: "overdraft",
                });
                rowTransaction = resultKlarnaTransaction?.rows?.[0]?.transaction_details || [];
              }
              if (rowTransaction && rowTransaction.length) {
                if (responseData.payment_schedule == "Pay in 30 days") {
                  var klarnaTransaction = _.filter(rowTransaction, (row) => {
                    if (
                      row.merchant_name == "Klarna" &&
                      Math.abs(row.amount) == responseData?.price_of_purchase &&
                      moment(row.timestamp).format(dateFormat) > moment(responseData.date_of_purchase).format(dateFormat) &&
                      moment(row.timestamp).format(dateFormat) < moment(responseData.date_of_purchase).add(30, "d").format(dateFormat)
                    ) {
                      return row;
                    }
                  });
                  if (klarnaTransaction && klarnaTransaction.length) {
                    responseData.payment_completed = true;
                  }
                } else {
                  if (installmentsData && installmentsData.length) {
                    await Promise.all(
                      installmentsData.map(async (installments) => {
                        if (!installments.completed) {
                          var klarnaTransaction = _.filter(rowTransaction, (row) => {
                            if (
                              row.merchant_name == "Klarna" &&
                              Math.abs(row.amount) == installments.installment_amount &&
                              moment(row.timestamp).format("YYYY-MM-DD") == moment(installments.installments_date).format("YYYY-MM-DD")
                            ) {
                              return row;
                            }
                          });
                          if (klarnaTransaction && klarnaTransaction.length) {
                            installments.completed = true;
                          }
                        }
                      })
                    );
                  }
                }
              }
            })
          );
        });
      }
      let payment_installments_details = {
        current_balance: responseData.current_balance || "",
        initial_payment: responseData.initial_payment || {},
        installments: responseData.installments || [],
        card_account_details: responseData.card_account_details || {},
        payment_completed: responseData?.payment_completed,
      };
      await DBManager.dataUpdate(
        "user_klarna_account_master",
        { payment_installments_details: JSON.stringify(payment_installments_details) },
        { klarna_id: klarnaId }
      );
      return resolve({ status: true, data: responseData });
    } catch (err) {
      resolve({ status: false, statusCode: err?.response?.status, message: err?.message });
    }
  });
};

module.exports = {
  checkKlarnaPayments,
};
