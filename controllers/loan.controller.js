var config = require("./../config/config");
const validate = require("../validations/loan.validation");
const responseHelper = require("./../common/responseHelper");
const truelayerHelper = require("./../common/truelayer");
const DB = require("./../common/dbmanager");
const DBManager = new DB();
const axios = require("axios").default;
const { successMessages, errorMessages } = require('../common/constants');
const moment = require("moment");
const dateFormat = "YYYY-MM-DD HH:mm:ss";
const _ = require("lodash");
const fs = require("fs");
const utils = require("./../common/utils");

module.exports = {
    bankList: async function (req, res) {
        var response = {
            status: false,
            message: "Server error! Please try again later",
        };
        try {
            var resultBanks = await DBManager.getData("loan_bank_master", "loan_bank_id, provider_id, bank_name as loan_bank_name, country");
            var rowBanks = resultBanks.rows || [];
            if (rowBanks && rowBanks.length > 0) {
                response.data = rowBanks;
                response.status = true;
                response.message = successMessages.BANK_LIST_SUCCESS;
                return responseHelper.respondSuccess(res, 200, response);
            } else {
                response.status = true;
                response.message = 'Loan Bank List Not Found.';
                return responseHelper.respondSuccess(res, 200, response);
            }
        } catch (error) {
            //console.log(error);
            return responseHelper.respondError(res, error);
        }
    },

    providerTransaction: async function (req, res) {
        var response = {
            status: false,
            message: "Server error! Please try again later",
        };
        try {
            const { userId } = req.user;
            var apiData = req.query;
            await validate.checkBankProviderId(apiData);
            var responseData = {};
            // Account transaction data
            var resultAccounts = await DBManager.runQuery(`SELECT user_overdraft_account_master.* FROM user_overdraft_account_master LEFT JOIN user_bank_account_master ON user_bank_account_master._user_id = user_overdraft_account_master._user_id AND user_bank_account_master._bank_id = user_overdraft_account_master._bank_id WHERE user_overdraft_account_master._user_id = '${userId}' AND user_overdraft_account_master.is_deleted = 0 AND user_bank_account_master.is_token_expired = 0`)
            //   var resultAccounts = await DBManager.getData("user_overdraft_account_master", "*", { _user_id: userId });
            var rowAccount = resultAccounts.rows || [];
            if (rowAccount && rowAccount.length) {
                var rowBankId = await _.uniqBy(rowAccount, '_bank_id');
                await Promise.all(rowBankId.map(async rowId => {
                    // Generate truelayer access token.
                    let data = {
                        user: { userId: userId },
                        body: { bank_id: rowId._bank_id }
                    }
                    var tokens = await truelayerHelper.generateTruelayerToken(data);
                    return { bank_id: rowId._bank_id, token: tokens };
                })).then(async (tokens) => {
                    await Promise.all(rowAccount.map(async rowData => {
                        var resultToken = await _.find(tokens, { bank_id: rowData._bank_id });
                        resultToken = resultToken.token;
                        var rowToken = resultToken?.data || [];
                        var resultLoanTransaction = await DBManager.getData("user_loan_transaction", "*", { _user_id: userId, card_account_id: rowData.user_overdraft_account_id, account_type: 'overdraft', loan_provider_id: apiData.provider_id });
                        var rowLoanTransaction = resultLoanTransaction?.rows || [];
                        var responseData = {
                            user_overdraft_account_id: rowData?.user_overdraft_account_id,
                            account_type: "overdraft",
                            bank_id: rowData?._bank_id,
                            platform_card_account_id: rowData?.truelayer_account_id,
                            account_details: {
                                display_name: rowData?.account_details?.provider?.display_name || rowData?.account_details?.display_name,
                                provider_id: rowData?.account_details?.provider?.provider_id || rowData?.account_details?.provider_id,
                                logo_uri: rowData?.account_details?.provider?.logo_uri || rowData?.account_details?.logo_uri
                            }
                        }
                        if (rowLoanTransaction && rowLoanTransaction.length) {
                            let start_date = rowLoanTransaction?.[0]?.end_date;
                            let end_date = moment.utc().format(dateFormat);
                            var transactionData = rowLoanTransaction[0];
                            if (start_date != end_date) {
                                var rowToken = resultToken.data || [];
                                if (resultToken.status) {
                                    var resultTransaction = await axios.request(
                                        {
                                            method: 'get',
                                            url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts/${rowData.truelayer_account_id}/transactions?from=${utils.escapeUrl(start_date)}&to=${utils.escapeUrl(end_date)}`,
                                            headers: { "content-type": 'application/x-www-form-urlencoded', "Authorization": `Bearer ${rowToken.access_token}` }
                                        })
                                    var rowTransaction = resultTransaction?.data?.results || [];
                                    if (rowTransaction && rowTransaction.length) {
                                        var providerTransaction = _.filter(rowTransaction, { merchant_name: apiData.provider_id });
                                        if (providerTransaction && providerTransaction.length) {
                                            transactionData.transaction_details.push(...providerTransaction);
                                            await DBManager.dataUpdate("user_loan_transaction", { start_date: start_date, end_date: end_date, transaction_details: JSON.stringify(transactionData.transaction_details) }, { user_loan_transaction_id: transactionData.user_loan_transaction_id });
                                            responseData.transaction_details = transactionData.transaction_details;
                                            return responseData;
                                        }
                                        else {
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
                                var resultTransaction = await axios.request(
                                    {
                                        method: 'get',
                                        url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts/${rowData.truelayer_account_id}/transactions`,
                                        headers: { "Authorization": `Bearer ${rowToken.access_token}` }
                                    })
                                var rowTransaction = resultTransaction?.data?.results || [];
                                if (rowTransaction && rowTransaction.length) {
                                    var providerTransaction = _.filter(rowTransaction, { merchant_name: apiData.provider_id });
                                    if (providerTransaction && providerTransaction.length) {
                                        let dataObj = {
                                            _user_id: userId,
                                            platform_card_account_id: rowData.truelayer_account_id,
                                            card_account_id: rowData.user_overdraft_account_id,
                                            loan_provider_id: apiData.provider_id,
                                            account_type: "overdraft",
                                            start_date: "",
                                            end_date: moment.utc().format(dateFormat),
                                            transaction_details: JSON.stringify(providerTransaction),
                                        }
                                        await DBManager.dataInsert("user_loan_transaction", dataObj);
                                        responseData.transaction_details = providerTransaction
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
                    })).then(async (data) => {
                        responseData.account_details = data;
                    })
                })
            } else {
                responseData.account_details = [];
            }
            response.data = responseData;
            response.status = true;
            response.message = 'Loan Provide Transaction Listed Successfully.';
            return responseHelper.respondSuccess(res, 200, response);
        } catch (error) {
            // console.log(error);
            return responseHelper.respondError(res, error);
        }
    },
}