var config = require("./../config/config");
const validate = require("../validations/truelayer.validation");
const responseHelper = require("./../common/responseHelper");
const truelayerHelper = require("./../common/truelayer");
const DB = require("./../common/dbmanager");
const DBManager = new DB();
const axios = require("axios").default;
const { successMessages, errorMessages } = require("../common/constants");
const moment = require("moment");
const dateFormat = "YYYY-MM-DD HH:mm:ss";
const _ = require("lodash");
const fs = require("fs");
const utils = require("./../common/utils");

module.exports = {
  // This function is used to get lists of banks.
  bankList: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      console.log("---------------Starting bank list api------------------");
      console.log("user_id:", req.user.userId);
      var resultBanks =
        config.TRUELAYER_MODE === "live"
          ? await DBManager.runQuery(
              `SELECT bank_id, provider_id, bank_name, country, logo_url, scopes FROM bank_master WHERE provider_id != 'mock' AND country = 'uk'`
            )
          : await DBManager.runQuery(
              `SELECT bank_id, provider_id, bank_name, country, logo_url, scopes FROM bank_master WHERE provider_id = 'mock' AND country = 'uk'`
            );
      var rowBanks = resultBanks.rows || [];
      if (rowBanks && rowBanks.length > 0) {
        response.data = rowBanks;
        response.status = true;
        response.message = successMessages.BANK_LIST_SUCCESS;
        return responseHelper.respondSuccess(res, 200, response);
      } else {
        response.status = false;
        response.message = errorMessages.BANK_LIST_DATA_NOT_FOUND;
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      console.log("auth token error ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to generate truelayer auth dialog link.
  generateAuthDialogLink: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      console.log("---------------Starting generate auth link api------------------");
      console.log("user_id:", req.user.userId);
      var apiData = req.query;
      await validate.checkBankProviderId(apiData);
      response.data = {
        authLink: `${config.TRUELAYER_AUTH_BASE_URL}/?response_type=code&client_id=${config.TRUELAYER_CLIENT_ID}&scope=info%20accounts%20balance%20cards%20transactions%20direct_debits%20standing_orders%20offline_access&redirect_uri=${config.TRUELAYER_REDIRECT_URI}&provider_id=${apiData.provider_id}`,
      };
      response.data.authLink =
        apiData.type == "reconnect" || apiData.type == "reconnect-profile"
          ? response.data.authLink + `&state=${apiData.type}`
          : response.data.authLink;
      response.status = true;
      response.message = successMessages.GENERATE_AUTH_LINK_SUCCESS;
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      console.log("auth token error ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get access token and refresh token and save it to the database.
  authToken: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      console.log("---------------Starting auth token api------------------");
      console.log("user_id:", req.user.userId);
      const { userId } = req.user;
      var apiData = req.body;
      await validate.checkBankAuthCode(apiData);
      // Exchange code to get truelayer access token and refresh token.
      const options = {
        method: "post",
        url: `${config.TRUELAYER_AUTH_BASE_URL}/connect/token`,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        data: {
          grant_type: "authorization_code",
          client_id: config.TRUELAYER_CLIENT_ID,
          client_secret: config.TRUELAYER_SECRET_KEY,
          code: apiData.code,
          redirect_uri: config.TRUELAYER_REDIRECT_URI,
        },
      };
      var resultData = await axios.request(options);
      var rowData = resultData?.data || [];
      if (rowData) {
        // Data about the access token and account connection.
        var resultProvider = await axios.request({
          method: "get",
          url: `${config.TRUELAYER_API_BASE_URL}/data/v1/me`,
          headers: { Authorization: `Bearer ${rowData.access_token}` },
        });
        var rowProvider = resultProvider?.data?.results || [];
        var providerId = rowProvider?.[0]?.provider?.provider_id || "";
        var scopes = rowProvider?.[0]?.scopes || [];
        if (providerId && providerId.length) {
          var resultBank = await DBManager.getData("bank_master", "bank_id", { provider_id: providerId });
          var rowBank = resultBank.rows || [];
          var bankId = rowBank?.[0]?.bank_id;
          if (bankId) {
            var resultUserBank = await DBManager.getData("user_bank_account_master", "user_bank_account_id", { _bank_id: bankId, _user_id: userId });
            var rowUserBank = resultUserBank.rows || [];
            var userBankAccountId = rowUserBank?.[0]?.user_bank_account_id;
            // Check user bank account exist.
            if (userBankAccountId) {
              var dataObj = {
                refresh_token: rowData.refresh_token,
                consent_expires_at: rowData?.consent_expires_at || "",
                next_refresh_token_time: moment.utc().add(29, "d").format(dateFormat),
                is_token_expired: 0,
              };
              var whereQry = {
                _bank_id: bankId,
                _user_id: userId,
              };
              await DBManager.dataUpdate("user_bank_account_master", dataObj, whereQry);
              response.status = true;
              response.data = {
                scopes: scopes,
              };
              response.message = successMessages.GENERATE_ACCESS_REFRESH_TOKEN;
              console.log("auth token generated and updated", response.message);
              console.log("_bank_id ======", bankId, "    _user_id =====", userId);
              return responseHelper.respondSuccess(res, 200, response);
            } else {
              var insertQry = {
                _bank_id: bankId,
                _user_id: userId,
                refresh_token: rowData.refresh_token,
                consent_expires_at: rowData?.consent_expires_at || "",
                next_refresh_token_time: moment.utc().add(29, "d").format(dateFormat),
                is_token_expired: 0,
              };
              await DBManager.dataInsert("user_bank_account_master", insertQry);
              response.status = true;
              response.data = {
                scopes: scopes,
              };
              response.message = successMessages.GENERATE_ACCESS_REFRESH_TOKEN;
              console.log("auth token generated and inserted", response.message);
              console.log("_bank_id ======", bankId, "    _user_id =====", req.user.userId);
              return responseHelper.respondSuccess(res, 200, response);
            }
          } else {
            response.status = false;
            response.message = errorMessages.BANK_ID_NOT_FOUND;
            console.log("auth token error ###############", response);
            return responseHelper.respondSuccess(res, 200, response);
          }
        } else {
          response.status = false;
          response.message = errorMessages.PROVIDER_ID_NOT_FOUND;
          console.log("auth token error ###############", response);
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        response.status = false;
        response.message = errorMessages.TOKEN_NOT_FOUND;
        console.log("auth token error ###############", response);
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      console.log("auth token error ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to redirect user from truelayer auth dialog link to application.
  authExchangeCode: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      console.log("---------------Starting auth exchange code api------------------");
      var { code, state, error } = req.query;

      if (code) {
        if (state && state == "reconnect") {
          res.redirect(`superfi://truelayer-account/${code}`);
        }
        if (state && state == "reconnect-profile") {
          res.redirect(`superfi://truelayer-profile/${code}`);
        }
        res.redirect(`superfi://truelayer/${code}`);
        console.log("redirect url exchange code   ", `superfi://truelayer/${code}`);
      } else {
        if (error) {
          res.redirect(`superfi://truelayer`);
        }
        var template = fs.readFileSync("./html-templates/exchange_code.html", "utf8");
        var pageParams = Object.assign({
          errorMessage: response.message,
        });

        var pageTemplate = _.template(template)(pageParams);
        res.redirect(pageTemplate);
        console.log("redirect pagetemplate exchange code");
      }
    } catch (error) {
      //console.log(error);
      console.log("auth exchange code error ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get bank cards type.
  bankCards: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      console.log("---------------Starting bank cards api------------------");
      console.log("user_id:", req.user.userId);
      const { userId } = req.user;
      var apiData = req.body;
      await validate.checkBankId(apiData);
      console.log("user_id: ", userId);
      var resultToken = await truelayerHelper.generateTruelayerToken(req);
      var rowToken = resultToken?.data || [];
      if (resultToken.status) {
        // List all bank cards.
        var resultCard = await axios.request({
          method: "get",
          url: `${config.TRUELAYER_API_BASE_URL}/data/v1/cards`,
          headers: { Authorization: `Bearer ${rowToken.access_token}` },
        });
        var rowCard = resultCard?.data?.results || [];
        if (rowCard && rowCard.length) {
          console.log("bank cards api truelayer /data/v1/cards---> length:", rowCard.length);
          let responseData = [];
          await Promise.all(
            rowCard.map(async (rowCardData) => {
              var resultSavedCard = await DBManager.getData("user_card_master", "user_card_id", {
                _user_id: userId,
                _bank_id: apiData.bank_id,
                truelayer_card_id: rowCardData.account_id,
              });
              var rowSavedCard = resultSavedCard?.rows || [];
              if (!rowSavedCard.length) {
                // List card brand and card type data.
                rowCardData.bank_id = apiData.bank_id;
                var resultBrand = await DBManager.getData("card_brand_master", "card_brand_id, brand_image, brand_name", {
                  brand_sku_code: rowCardData.provider.provider_id,
                });
                var rowBrand = resultBrand?.rows || [];
                var cardBrandId = rowBrand?.[0]?.card_brand_id;
                let responseCardType = [];
                let responseCardData = [];
                if (cardBrandId) {
                  var resultCardType = await DBManager.getData(
                    "card_brand_type_master",
                    "card_type_id, card_type_name, card_type_image, interest_rate",
                    { _card_brand_id: cardBrandId }
                  );
                  var rowCardType = resultCardType?.rows || [];
                  var resultBank = await DBManager.getData("bank_master", "logo_url", { bank_id: apiData.bank_id });
                  var rowBank = resultBank?.rows || [];
                  if (rowCardType && rowCardType.length) {
                    await rowCardType.forEach(async (rowType) => {
                      let data = {
                        brand_id: cardBrandId,
                        brand_name: rowBrand?.[0]?.brand_name || "",
                        brand_image: rowBrand?.[0]?.brand_image || "",
                        card_type_id: rowType?.card_type_id,
                        card_type_name: rowType?.card_type_name || "",
                        interest_rate: rowType?.interest_rate || "",
                        card_type_image: rowType?.card_type_image || "",
                      };
                      responseCardType.push(data);
                    });
                    responseCardData = {
                      account_id: rowCardData?.account_id,
                      card_network: rowCardData?.card_network,
                      card_type: rowCardData?.card_type,
                      currency: rowCardData?.currency,
                      ...rowCardData?.provider,
                      logo_uri: rowBank?.[0]?.logo_url,
                      card_brand_data: responseCardType,
                      partial_card_number: rowCardData?.partial_card_number,
                      card_display_name: rowCardData?.display_name,
                    };
                  }
                  var resultCardBalance = await axios.request({
                    method: "get",
                    url: `${config.TRUELAYER_API_BASE_URL}/data/v1/cards/${rowCardData.account_id}/balance`,
                    headers: { Authorization: `Bearer ${rowToken.access_token}` },
                  });
                  var rowCardBalance = resultCardBalance?.data?.results || [];
                  if (rowCardBalance && rowCardBalance.length) {
                    responseCardData.current_balance = rowCardBalance?.[0]?.current;
                    responseCardData.credit_limit = rowCardBalance?.[0]?.credit_limit;
                    responseCardData.available_balance = rowCardBalance?.[0]?.available;
                  }
                }
                responseData.push(responseCardData);
              }
            })
          ).then(() => {
            if (responseData.length) {
              response.data = responseData;
              response.status = true;
              response.message = "Card Data Listed Successfully.";
              console.log("bank cards api response ------>", response);
              return responseHelper.respondSuccess(res, 200, response);
            }
            response.status = true;
            response.message = "Card Data List Not Found.";
            console.log("bank cards api response ------->", response);
            return responseHelper.respondSuccess(res, 200, response);
          });
        } else {
          response.status = true;
          response.message = "Card Data Not Found.";
          console.log("bank cards api error ###############", response);
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        response.status = false;
        response.message = "Token Not Generated.";
        console.log("bank cards api error ###############", response);
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      console.log("bank cards api error ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get users saved card with truelayer live card details.
  cardInfo: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      console.log("---------------Starting card info get api------------------");
      console.log("user_id:", req.user.userId);
      const { userId } = req.user;
      const { information_type } = req.query;
      var resultUserCards = await DBManager.runQuery(
        `SELECT user_card_id, _bank_id, truelayer_card_id, _card_type_id, custom_brand_type_name, custom_interest_rate, logo_url, card_details FROM user_card_master LEFT JOIN bank_master ON user_card_master._bank_id = bank_master.bank_id WHERE _user_id = '${userId}' AND user_card_master.is_deleted = 0`
      );
      var rowUserCards = resultUserCards?.rows || [];
      if (rowUserCards && rowUserCards.length) {
        if (information_type == "local") {
          await Promise.all(
            rowUserCards.map(async (rowData) => {
              var decryptCardDetails = await utils.decryptData(rowData.card_details);
              let responseData = {
                user_card_id: rowData?.user_card_id,
                bank_id: rowData?._bank_id,
                platform_card_account_id: rowData?.truelayer_card_id,
                custom_interest_rate: rowData?.custom_interest_rate || "",
                initial_minimum_repayment: decryptCardDetails.minimum_repayment,
                minimum_repayment: utils.createMinimumRepayment(Math.abs(decryptCardDetails.current_balance), rowData.custom_interest_rate),
                account_type: "credit card",
                ...decryptCardDetails,
                ...decryptCardDetails.provider,
                approx_monthly_cost:
                  decryptCardDetails.current_balance > 0
                    ? decryptCardDetails.current_balance &&
                      (decryptCardDetails.updated_interest_rate || decryptCardDetails.custom_interest_rate || decryptCardDetails.interest_rate)
                      ? Math.abs(
                          decryptCardDetails.current_balance *
                            ((decryptCardDetails.updated_interest_rate ||
                              decryptCardDetails.custom_interest_rate ||
                              decryptCardDetails.interest_rate) /
                              100 /
                              12)
                        ).toFixed(2)
                      : decryptCardDetails?.approx_monthly_cost
                    : 0,
              };
              return responseData;
            })
          ).then((responseData) => {
            response.data = responseData;
            response.status = true;
            response.message = "Card Data Listed Successfully.";
            console.log("card info get api response------->", response);
            return responseHelper.respondSuccess(res, 200, response);
          });
        } else {
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
                var decryptCardDetails = await utils.decryptData(rowData.card_details);
                // return manually added card.
                if (!rowData.truelayer_card_id) {
                  let manuallyAddedCards = {
                    initial_minimum_repayment: decryptCardDetails.minimum_repayment,
                    minimum_repayment: utils.createMinimumRepayment(Math.abs(decryptCardDetails.current_balance), rowData.custom_interest_rate),
                    ...rowData,
                    ...decryptCardDetails,
                  };
                  delete manuallyAddedCards.card_details;
                  return manuallyAddedCards;
                }
                var resultToken = await _.find(tokens, { bank_id: rowData._bank_id });
                resultToken = resultToken.token;
                var rowToken = resultToken?.data || [];
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
                      return;
                    } else {
                      let localResponseData = {
                        user_card_id: rowData?.user_card_id,
                        bank_id: rowData?._bank_id,
                        platform_card_account_id: rowData?.truelayer_card_id,
                        account_type: "credit card",
                        logo_uri: rowData?.logo_url,
                        estimated_due_date: decryptCardDetails?.estimated_due_date,
                        updated_estimated_due_date: decryptCardDetails?.updated_estimated_due_date,
                        initial_minimum_repayment: decryptCardDetails?.minimum_repayment,
                        updated_credit_limit: decryptCardDetails?.updated_credit_limit || 0,
                        is_token_expired: true,
                        ...decryptCardDetails,
                        approx_monthly_cost:
                          decryptCardDetails.current_balance > 0
                            ? decryptCardDetails.current_balance &&
                              (decryptCardDetails.updated_interest_rate ||
                                decryptCardDetails.custom_interest_rate ||
                                decryptCardDetails.interest_rate)
                              ? Math.abs(
                                  decryptCardDetails.current_balance *
                                    ((decryptCardDetails.updated_interest_rate ||
                                      decryptCardDetails.custom_interest_rate ||
                                      decryptCardDetails.interest_rate) /
                                      100 /
                                      12)
                                ).toFixed(2)
                              : decryptCardDetails?.approx_monthly_cost
                            : 0,
                      };
                      return localResponseData;
                    }
                  }

                  var rowCard = resultCard?.data?.results || [];
                  if (rowCard && rowCard.length) {
                    console.log(`card info truelayer /data/v1/cards/${rowData.truelayer_card_id}---> length:`, rowCard.length);
                    var responseData = {
                      user_card_id: rowData?.user_card_id,
                      bank_id: rowData?._bank_id,
                      platform_card_account_id: rowData?.truelayer_card_id,
                      account_type: "credit card",
                      currency: rowCard[0]?.currency,
                      logo_uri: rowData?.logo_url,
                      partial_card_number: rowCard[0]?.partial_card_number,
                      card_display_name: rowCard[0]?.display_name,
                      estimated_due_date: decryptCardDetails?.estimated_due_date,
                      updated_estimated_due_date: decryptCardDetails?.updated_estimated_due_date,
                      approx_monthly_cost:
                        decryptCardDetails.current_balance > 0
                          ? decryptCardDetails.current_balance &&
                            (decryptCardDetails.updated_interest_rate || decryptCardDetails.custom_interest_rate || decryptCardDetails.interest_rate)
                            ? Math.abs(
                                decryptCardDetails.current_balance *
                                  ((decryptCardDetails.updated_interest_rate ||
                                    decryptCardDetails.custom_interest_rate ||
                                    decryptCardDetails.interest_rate) /
                                    100 /
                                    12)
                              ).toFixed(2)
                            : decryptCardDetails?.approx_monthly_cost
                          : 0,
                      initial_minimum_repayment: decryptCardDetails?.minimum_repayment,
                      updated_credit_limit: decryptCardDetails?.updated_credit_limit || 0,
                      is_token_expired: false,
                    };
                    if (decryptCardDetails.updated_interest_rate) {
                      responseData.updated_interest_rate = decryptCardDetails.updated_interest_rate;
                    }
                    if (decryptCardDetails.updated_minimum_repayment) {
                      responseData.updated_minimum_repayment = decryptCardDetails.updated_minimum_repayment;
                    }
                    if (rowData._card_type_id) {
                      // List card brand type.
                      var resultCardType = await DBManager.getData(
                        "card_brand_type_master",
                        "_card_brand_id, card_type_id, card_type_name, card_type_image, interest_rate",
                        { card_type_id: rowData._card_type_id }
                      );
                      var rowCardType = resultCardType?.rows || [];
                      if (rowCardType && rowCardType.length) {
                        (responseData.card_brand_id = rowCardType?.[0]?._card_brand_id),
                          (responseData.card_type_id = rowCardType?.[0]?.card_type_id),
                          (responseData.card_type_name = rowCardType?.[0]?.card_type_name || ""),
                          (responseData.interest_rate = rowCardType?.[0]?.interest_rate || ""),
                          (responseData.card_type_image = rowCardType?.[0]?.card_type_image || "");
                      }
                    } else {
                      responseData.custom_brand_type_name = rowData.custom_brand_type_name;
                      responseData.custom_interest_rate = rowData.custom_interest_rate;
                    }

                    // List user bank card balance.
                    try {
                      var resultCardBalance = await axios.request({
                        method: "get",
                        url: `${config.TRUELAYER_API_BASE_URL}/data/v1/cards/${rowData.truelayer_card_id}/balance`,
                        headers: { Authorization: `Bearer ${rowToken.access_token}` },
                      });
                    } catch (error) {
                      responseData.is_token_expired = true;
                    }
                    var rowCardBalance = resultCardBalance?.data?.results || [];
                    if (rowCardBalance && rowCardBalance.length) {
                      console.log(`card info truelayer /data/v1/cards/${rowData.truelayer_card_id}/balance---> length:`, rowCardBalance.length);
                      responseData.available_balance = rowCardBalance?.[0].available;
                      responseData.original_balance = rowCardBalance?.[0].current;
                      responseData.current_balance = rowCardBalance?.[0].current;
                      responseData.credit_limit = rowCardBalance?.[0].credit_limit;
                      responseData.minimum_repayment = utils.createMinimumRepayment(
                        Math.abs(rowCardBalance?.[0]?.current),
                        responseData?.updated_interest_rate || responseData?.custom_interest_rate || responseData?.interest_rate
                      );
                      responseData.approx_monthly_cost =
                        rowCardBalance?.[0].current > 0
                          ? rowCardBalance?.[0].current &&
                            (decryptCardDetails.updated_interest_rate || decryptCardDetails.custom_interest_rate || decryptCardDetails.interest_rate)
                            ? Math.abs(
                                rowCardBalance?.[0].current *
                                  ((decryptCardDetails.updated_interest_rate ||
                                    decryptCardDetails.custom_interest_rate ||
                                    decryptCardDetails.interest_rate) /
                                    100 /
                                    12)
                              ).toFixed(2)
                            : responseData.approx_monthly_cost
                          : 0;
                    }
                    var dataObj = {
                      provider: rowCard[0]?.provider,
                      ...responseData,
                    };
                    let encryptCardDetails = await utils.encryptData(dataObj);
                    await DBManager.dataUpdate("user_card_master", { card_details: encryptCardDetails }, { user_card_id: rowData.user_card_id });
                    responseData = {
                      ...rowCard[0]?.provider,
                      ...responseData,
                    };
                    return responseData;
                  }
                } else {
                  if (resultToken.message == "invalid_grant" || resultToken.message == "Token Expired") {
                    var responseData = {
                      user_card_id: rowData?.user_card_id,
                      bank_id: rowData?._bank_id,
                      platform_card_account_id: rowData?.truelayer_card_id,
                      account_type: "credit card",
                      currency: decryptCardDetails?.currency,
                      display_name: decryptCardDetails?.display_name,
                      provider_id: decryptCardDetails?.provider_id,
                      logo_uri: decryptCardDetails?.logo_uri,
                      ...decryptCardDetails?.provider,
                      logo_uri: rowData?.logo_url,
                      partial_card_number: decryptCardDetails?.partial_card_number || "",
                      card_display_name: decryptCardDetails?.card_display_name || "",
                      available_balance: decryptCardDetails?.available_balance,
                      original_balance: decryptCardDetails?.original_balance,
                      current_balance: decryptCardDetails?.current_balance,
                      credit_limit: decryptCardDetails?.credit_limit,
                      estimated_due_date: decryptCardDetails?.estimated_due_date,
                      updated_estimated_due_date: decryptCardDetails?.updated_estimated_due_date,
                      approx_monthly_cost:
                        decryptCardDetails.current_balance > 0
                          ? decryptCardDetails.current_balance &&
                            (decryptCardDetails.updated_interest_rate || decryptCardDetails.custom_interest_rate || decryptCardDetails.interest_rate)
                            ? Math.abs(
                                decryptCardDetails.current_balance *
                                  ((decryptCardDetails.updated_interest_rate ||
                                    decryptCardDetails.custom_interest_rate ||
                                    decryptCardDetails.interest_rate) /
                                    100 /
                                    12)
                              ).toFixed(2)
                            : decryptCardDetails?.approx_monthly_cost
                          : 0,
                      updated_credit_limit: decryptCardDetails?.updated_credit_limit || 0,
                      is_token_expired: true,
                    };
                    if (decryptCardDetails.updated_minimum_repayment) {
                      responseData.updated_minimum_repayment = decryptCardDetails.updated_minimum_repayment;
                    }
                    if (decryptCardDetails.updated_interest_rate) {
                      responseData.updated_interest_rate = decryptCardDetails.updated_interest_rate;
                    } else if (rowData._card_type_id) {
                      var resultCardType = await DBManager.getData(
                        "card_brand_type_master",
                        "_card_brand_id, card_type_id, card_type_name, card_type_image, interest_rate",
                        { card_type_id: rowData._card_type_id }
                      );
                      var rowCardType = resultCardType?.rows || [];
                      if (rowCardType && rowCardType.length) {
                        (responseData.card_brand_id = rowCardType?.[0]?._card_brand_id),
                          (responseData.card_type_id = rowCardType?.[0]?.card_type_id),
                          (responseData.card_type_name = rowCardType?.[0]?.card_type_name || ""),
                          (responseData.interest_rate = rowCardType?.[0]?.interest_rate || ""),
                          (responseData.card_type_image = rowCardType?.[0]?.card_type_image || "");
                      }
                    } else {
                      responseData.custom_brand_type_name = decryptCardDetails?.custom_brand_type_name || "";
                      responseData.custom_interest_rate = decryptCardDetails?.custom_interest_rate || "";
                    }
                    responseData.minimum_repayment =
                      decryptCardDetails?.current_balance && (responseData?.custom_interest_rate || responseData?.interest_rate)
                        ? utils.createMinimumRepayment(
                            Math.abs(decryptCardDetails?.current_balance),
                            responseData?.custom_interest_rate || responseData?.interest_rate
                          )
                        : decryptCardDetails?.minimum_repayment || 0;
                    decryptCardDetails.is_token_expired = responseData.is_token_expired;
                    let encryptCardDetails = await utils.encryptData(decryptCardDetails);
                    await DBManager.dataUpdate("user_card_master", { card_details: encryptCardDetails }, { user_card_id: rowData.user_card_id });
                    return responseData;
                  } else {
                    response.status = false;
                    response.message = resultToken.message;
                    console.log("card info get api error ###############", response);
                    return responseHelper.respondSuccess(res, 200, response);
                  }
                }
              })
            ).then((responseData) => {
              responseData = responseData.filter((element) => {
                if (element != undefined) {
                  return true;
                }
                return false;
              });
              response.data = responseData;
              response.status = true;
              response.message = "Card Data Listed Successfully.";
              console.log("card info get api response------->", response);
              return responseHelper.respondSuccess(res, 200, response);
            });
          });
        }
      } else {
        response.status = true;
        response.message = "Users Card Not Found.";
        console.log("card info get api error ###############", response);
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      console.log("card info get api error ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to save users card details.
  saveCardInfo: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      console.log("---------------Starting save card info api------------------");
      console.log("user_id:", req.user.userId);
      const { userId } = req.user;
      var apiData = req.body;
      await validate.checkCardData(apiData);
      await Promise.all(
        apiData.map(async (cardInfo) => {
          let data = {
            user: { userId: userId },
            body: { bank_id: cardInfo.bank_id },
          };
          var resultTokens = await truelayerHelper.generateTruelayerToken(data);
          if (resultTokens.status) {
            console.log("save card info truelayer token generated.");
            rowToken = resultTokens?.data || [];
            var resultCardBalance = await axios.request({
              method: "get",
              url: `${config.TRUELAYER_API_BASE_URL}/data/v1/cards/${cardInfo.account_id}/balance`,
              headers: { Authorization: `Bearer ${rowToken.access_token}` },
            });
            var rowCardBalance = resultCardBalance?.data?.results || [];
            if (rowCardBalance && rowCardBalance.length) {
              console.log(`save card info truelayer /data/v1/cards/${cardInfo.account_id}/balance---> length:`, rowCardBalance.length);
              cardInfo.available_balance = rowCardBalance?.[0].available;
              cardInfo.current_balance = rowCardBalance?.[0].current;
              cardInfo.original_balance = rowCardBalance?.[0].current;
              cardInfo.credit_limit = rowCardBalance?.[0].credit_limit;
              cardInfo.initial_minimum_repayment = cardInfo.minimum_repayment;
              cardInfo.minimum_repayment = utils.createMinimumRepayment(
                Math.abs(rowCardBalance?.[0]?.current),
                cardInfo?.custom_interest_rate || cardInfo?.interest_rate
              );
            }
          }
          var resultData = await DBManager.getData("user_card_master", "user_card_id, card_details", {
            _user_id: userId,
            _bank_id: cardInfo.bank_id,
            truelayer_card_id: cardInfo.account_id,
          });
          var rowData = resultData?.rows || [];

          var userCardId = rowData?.[0]?.user_card_id || "";
          // var estimatedDueDate = rowData?.[0]?.card_details?.estimated_due_date || '';
          // var updatedEstimatedDueDate = rowData?.[0]?.card_details?.updated_estimated_due_date || '';
          // // Check user bank card saved.
          if (userCardId) {
            var cardDetails = await utils.decryptData(rowData?.[0]?.card_details);
            if (rowData && rowData.length) {
              cardDetails.available_balance = cardInfo.available_balance;
              cardDetails.current_balance = cardInfo.current_balance;
              cardDetails.original_balance = cardInfo.original_balance;
              cardDetails.credit_limit = cardInfo.credit_limit;
              cardDetails.initial_minimum_repayment = cardDetails.minimum_repayment;
              cardDetails.minimum_repayment = cardInfo.minimum_repayment;
            }
            // if (estimatedDueDate) {
            //     cardInfo.estimated_due_date = estimatedDueDate;
            // }
            // if (updatedEstimatedDueDate) {
            //     cardInfo.updated_estimated_due_date = updatedEstimatedDueDate;
            // }
            var dataObj = {
              _card_type_id: cardInfo?.card_type_id,
              custom_brand_type_name: cardInfo?.custom_brand_type_name || null,
              custom_interest_rate: cardInfo?.custom_interest_rate || null,
              card_details: await utils.encryptData(cardDetails),
            };
            await DBManager.dataUpdate("user_card_master", dataObj, { user_card_id: userCardId });
            console.log("save card info data updated.", { user_card_id: userCardId });
          } else {
            var insertData = {
              _user_id: userId,
              _bank_id: cardInfo.bank_id,
              truelayer_card_id: cardInfo.account_id,
              _card_type_id: cardInfo?.card_type_id,
              custom_brand_type_name: cardInfo?.custom_brand_type_name || null,
              custom_interest_rate: cardInfo?.custom_interest_rate || null,
              card_details: await utils.encryptData(cardInfo),
            };
            await DBManager.dataInsert("user_card_master", insertData);
            console.log("save card info data inserted.");
          }
        })
      ).then(() => {
        response.status = true;
        response.message = "Card Saved Successfully.";
        console.log("save card info api response -------->", response);
        return responseHelper.respondSuccess(res, 200, response);
      });
    } catch (error) {
      //console.log(error);
      console.log("save card info api  ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to save users overdraft account details.
  saveAccountInfo: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      console.log("---------------Starting save account info api------------------");
      console.log("user_id:", req.user.userId);
      const { userId } = req.user;
      var apiData = req.body;
      await validate.checkBankId(apiData);
      // Generate truelayer access token and refresh token.
      var resultToken = await truelayerHelper.generateTruelayerToken(req);
      var rowToken = resultToken?.data || [];
      if (resultToken.status) {
        console.log("save account info truelayer token generated.");
        // List users all bank accounts.
        var resultAccount = await axios.request({
          method: "get",
          url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts`,
          headers: { Authorization: `Bearer ${rowToken.access_token}` },
        });
        var rowAccount = resultAccount?.data?.results || [];
        if (rowAccount && rowAccount.length) {
          console.log(`save account info truelayer /data/v1/accounts---> length:`, rowAccount.length);
          await Promise.all(
            rowAccount.map(async (rowData) => {
              var responseData = rowData || [];
              // List users bank account balance.
              var resultBalance = await axios.request({
                method: "get",
                url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts/${rowData.account_id}/balance`,
                headers: { Authorization: `Bearer ${rowToken.access_token}` },
              });
              var rowBalance = resultBalance?.data?.results || [];
              if (rowBalance && rowBalance.length) {
                console.log(`save account info truelayer /data/v1/accounts/${rowData.account_id}/balance---> length:`, rowBalance.length);
                responseData.balance_info = rowBalance?.[0] || [];
                responseData.original_balance = rowBalance?.[0]?.current;
              }
              var resultData = await DBManager.getData("user_overdraft_account_master", "user_overdraft_account_id, account_details", {
                _user_id: userId,
                _bank_id: apiData.bank_id,
                truelayer_account_id: rowData.account_id,
              });
              var rowData = resultData?.rows || [];
              var userOverdraftAccountId = rowData?.[0]?.user_overdraft_account_id || "";
              // var estimatedDueDate = rowData?.[0]?.account_details?.estimated_due_date || '';
              // var updatedEstimatedDueDate = rowData?.[0]?.account_details?.updated_estimated_due_date || '';
              // Check user bank account saved.
              if (userOverdraftAccountId) {
                var accountDetails = await utils.decryptData(rowData?.[0]?.account_details);
                // if (estimatedDueDate) {
                //     responseData.estimated_due_date = estimatedDueDate;
                // }
                // if (updatedEstimatedDueDate) {
                //     responseData.updated_estimated_due_date = updatedEstimatedDueDate;
                // }
                accountDetails.balance_info = responseData.balance_info;
                accountDetails.original_balance = responseData.original_balance;
                var dataObj = {
                  account_details: await utils.encryptData(accountDetails),
                };
                await DBManager.dataUpdate("user_overdraft_account_master", dataObj, { user_overdraft_account_id: userOverdraftAccountId });
                console.log("save account info api data updated.", { user_overdraft_account_id: userOverdraftAccountId });
              } else {
                var insertData = {
                  _user_id: userId,
                  _bank_id: apiData.bank_id,
                  truelayer_account_id: responseData.account_id,
                  account_details: await utils.encryptData(responseData),
                };
                await DBManager.dataInsert("user_overdraft_account_master", insertData);
                console.log("save account info api data inserted.");
              }
            })
          ).then(() => {
            response.status = true;
            response.message = "Account Saved Successfully.";
            console.log("save account info api response ----->", response);
            return responseHelper.respondSuccess(res, 200, response);
          });
        } else {
          response.status = true;
          response.message = "Users Account Not Found.";
          console.log("save account info api error ###############", response);
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        response.status = false;
        response.message = resultToken.message;
        console.log("save account info api error ###############", response);
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      console.log("save account info api error ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get users saved overdraft account with truelayer live account details.
  accountInfo: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      console.log("---------------Starting account info get api------------------");
      console.log("user_id:", req.user.userId);
      const { information_type } = req.query;
      const { userId } = req.user;
      // List users all bank accounts.
      var resultUserAccounts =
        await DBManager.runQuery(`SELECT user_overdraft_account_id, _user_id, user_overdraft_account_master._bank_id, truelayer_account_id, overdraft_catalog_master.interest_rate as catalog_interest_rate, logo_url, account_details FROM user_overdraft_account_master 
                                                                LEFT JOIN overdraft_catalog_master ON user_overdraft_account_master._bank_id = overdraft_catalog_master._bank_id 
                                                                LEFT JOIN bank_master ON user_overdraft_account_master._bank_id = bank_master.bank_id
                                                                WHERE _user_id = '${userId}'  AND user_overdraft_account_master.is_deleted = 0`);
      var rowUserAccounts = resultUserAccounts?.rows || [];
      if (rowUserAccounts && rowUserAccounts.length) {
        if (information_type == "local") {
          await Promise.all(
            rowUserAccounts.map(async (rowData) => {
              var decryptAccountDetails = await utils.decryptData(rowData?.account_details);
              let responseData = {
                user_overdraft_account_id: rowData.user_overdraft_account_id,
                bank_id: rowData?._bank_id,
                platform_card_account_id: rowData?.truelayer_account_id,
                account_type: "overdraft",
                available_balance: decryptAccountDetails.balance_info?.available,
                original_balance: decryptAccountDetails.balance_info?.current,
                current_balance: decryptAccountDetails.balance_info?.current,
                overdraft: decryptAccountDetails.balance_info?.overdraft || 0,
                initial_minimum_repayment: decryptAccountDetails.minimum_repayment,
                minimum_repayment: utils.createMinimumRepayment(Math.abs(decryptAccountDetails.current_balance), rowData.custom_interest_rate),

                ...decryptAccountDetails,
                ...decryptAccountDetails.provider,
                approx_monthly_cost:
                  Math.abs(decryptAccountDetails.current_balance) > 0
                    ? decryptAccountDetails.current_balance &&
                      (decryptAccountDetails.updated_interest_rate ||
                        decryptAccountDetails.custom_interest_rate ||
                        decryptAccountDetails.interest_rate)
                      ? Math.abs(
                          decryptAccountDetails.current_balance *
                            ((decryptAccountDetails.updated_interest_rate ||
                              decryptAccountDetails.custom_interest_rate ||
                              decryptAccountDetails.interest_rate) /
                              100 /
                              12)
                        ).toFixed(2)
                      : decryptAccountDetails?.approx_monthly_cost
                    : 0,
              };
              return responseData;
            })
          ).then((responseData) => {
            response.data = responseData;
            response.status = true;
            response.message = "Account Listed Successfully.";
            console.log("account info get local api response response ###############", response);
            return responseHelper.respondSuccess(res, 200, response);
          });
        } else {
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
                var decryptAccountDetails = await utils.decryptData(rowData?.account_details);
                if (!rowData.truelayer_account_id) {
                  let manuallyAddedAccounts = {
                    initial_minimum_repayment: decryptAccountDetails.minimum_repayment,
                    minimum_repayment: utils.createMinimumRepayment(Math.abs(decryptAccountDetails.current_balance), rowData.custom_interest_rate),
                    ...rowData,
                    ...decryptAccountDetails,
                  };
                  delete manuallyAddedAccounts.account_details;
                  return manuallyAddedAccounts;
                }
                var resultToken = await _.find(tokens, { bank_id: rowData._bank_id });
                resultToken = resultToken.token;
                var rowToken = resultToken?.data || [];
                if (resultToken.status) {
                  console.log("account info get api truelayer token generated.");
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
                      return;
                    } else {
                      let localResponseData = {
                        user_overdraft_account_id: rowData.user_overdraft_account_id,
                        bank_id: rowData?._bank_id,
                        platform_card_account_id: rowData?.truelayer_account_id,
                        account_type: "overdraft",
                        interest_rate: rowData?.catalog_interest_rate || 0,
                        logo_uri: rowData?.logo_url,

                        is_token_expired: true,
                        ...decryptAccountDetails.provider,
                        ...decryptAccountDetails,
                        approx_monthly_cost:
                          decryptAccountDetails.current_balance > 0
                            ? decryptAccountDetails.current_balance &&
                              (decryptAccountDetails.updated_interest_rate ||
                                decryptAccountDetails.custom_interest_rate ||
                                decryptAccountDetails.interest_rate)
                              ? Math.abs(
                                  decryptAccountDetails.current_balance *
                                    ((decryptAccountDetails.updated_interest_rate ||
                                      decryptAccountDetails.custom_interest_rate ||
                                      decryptAccountDetails.interest_rate) /
                                      100 /
                                      12)
                                ).toFixed(2)
                              : decryptAccountDetails?.approx_monthly_cost
                            : 0,
                      };
                      delete localResponseData.provider;
                      return localResponseData;
                    }
                  }

                  var rowAccount = resultAccount?.data?.results || [];
                  if (rowAccount && rowAccount.length) {
                    console.log(`account info get api truelayer /data/v1/accounts/${rowData.truelayer_account_id}---> length:`, rowAccount.length);
                    var responseData = {
                      user_overdraft_account_id: rowData.user_overdraft_account_id,
                      bank_id: rowData?._bank_id,
                      platform_card_account_id: rowData?.truelayer_account_id,
                      account_type: "overdraft",
                      interest_rate: rowData?.catalog_interest_rate || 0,
                      currency: rowAccount?.[0]?.currency,
                      account_number: rowAccount?.[0]?.account_number,
                      logo_uri: rowData?.logo_url,
                      estimated_due_date: decryptAccountDetails.estimated_due_date,
                      updated_estimated_due_date: decryptAccountDetails.updated_estimated_due_date,
                      approx_monthly_cost:
                        decryptAccountDetails.current_balance > 0
                          ? decryptAccountDetails.current_balance &&
                            (decryptAccountDetails.updated_interest_rate ||
                              decryptAccountDetails.custom_interest_rate ||
                              decryptAccountDetails.interest_rate)
                            ? Math.abs(
                                decryptAccountDetails.current_balance *
                                  ((decryptAccountDetails.updated_interest_rate ||
                                    decryptAccountDetails.custom_interest_rate ||
                                    decryptAccountDetails.interest_rate) /
                                    100 /
                                    12)
                              ).toFixed(2)
                            : decryptAccountDetails?.approx_monthly_cost
                          : 0,
                      initial_minimum_repayment: decryptAccountDetails.minimum_repayment,
                      updated_overdraft_limit: decryptAccountDetails?.updated_overdraft_limit || 0,
                      is_token_expired: false,
                    };
                    if (decryptAccountDetails.updated_minimum_repayment) {
                      responseData.updated_minimum_repayment = decryptAccountDetails.updated_minimum_repayment;
                    }
                    if (decryptAccountDetails.updated_interest_rate) {
                      responseData.updated_interest_rate = decryptAccountDetails.updated_interest_rate;
                    }
                    // List users bank accounts balance.
                    try {
                      var resultBalance = await axios.request({
                        method: "get",
                        url: `${config.TRUELAYER_API_BASE_URL}/data/v1/accounts/${rowData.truelayer_account_id}/balance`,
                        headers: { Authorization: `Bearer ${rowToken.access_token}` },
                      });
                    } catch (error) {
                      responseData.is_token_expired = true;
                    }

                    var rowBalance = resultBalance?.data?.results || [];
                    if (rowBalance && rowBalance.length) {
                      console.log(`account info get api truelayer /data/v1/accounts/${rowData.truelayer_account_id}---> length:`, rowBalance.length);
                      responseData.available_balance = rowBalance?.[0].available;
                      responseData.original_balance = rowBalance?.[0].current;
                      responseData.current_balance = rowBalance?.[0].current;
                      responseData.overdraft = rowBalance?.[0]?.overdraft || 0;
                      responseData.minimum_repayment = utils.createMinimumRepayment(Math.abs(rowBalance?.[0]?.current), responseData?.interest_rate);
                      responseData.approx_monthly_cost =
                        rowBalance?.[0].current > 0
                          ? rowBalance?.[0].current &&
                            (decryptAccountDetails.updated_interest_rate ||
                              decryptAccountDetails.custom_interest_rate ||
                              decryptAccountDetails.interest_rate)
                            ? Math.abs(
                                rowBalance?.[0].current *
                                  ((decryptAccountDetails.updated_interest_rate ||
                                    decryptAccountDetails.custom_interest_rate ||
                                    decryptAccountDetails.interest_rate) /
                                    100 /
                                    12)
                              ).toFixed(2)
                            : responseData.approx_monthly_cost
                          : 0;
                    }
                    var dataObj = {
                      provider: rowAccount?.[0]?.provider,
                      ...responseData,
                    };
                    await DBManager.dataUpdate(
                      "user_overdraft_account_master",
                      { account_details: await utils.encryptData(dataObj) },
                      { user_overdraft_account_id: rowData.user_overdraft_account_id }
                    );
                    responseData = {
                      ...rowAccount?.[0]?.provider,
                      ...responseData,
                    };
                    return responseData;
                  }
                } else {
                  if (resultToken.message == "invalid_grant" || resultToken.message == "Token Expired") {
                    var responseData = {
                      user_overdraft_account_id: rowData.user_overdraft_account_id,
                      bank_id: rowData?._bank_id,
                      platform_card_account_id: rowData?.truelayer_account_id,
                      account_type: "overdraft",
                      interest_rate: rowData?.catalog_interest_rate || 0,
                      currency: decryptAccountDetails.currency,
                      account_number: decryptAccountDetails.account_number,
                      ...decryptAccountDetails.provider,
                      logo_uri: rowData?.logo_url,
                      available_balance: decryptAccountDetails.available_balance || 0,
                      original_balance: decryptAccountDetails.original_balance || 0,
                      current_balance: decryptAccountDetails.current_balance || 0,
                      overdraft: decryptAccountDetails.overdraft || 0,
                      minimum_repayment: utils.createMinimumRepayment(
                        Math.abs(decryptAccountDetails.current),
                        decryptAccountDetails.updated_interest_rate || rowData?.catalog_interest_rate || 0
                      ),
                      estimated_due_date: decryptAccountDetails.estimated_due_date,
                      updated_estimated_due_date: decryptAccountDetails.updated_estimated_due_date,
                      approx_monthly_cost:
                        decryptAccountDetails.current_balance > 0
                          ? decryptAccountDetails.current_balance &&
                            (decryptAccountDetails.updated_interest_rate ||
                              decryptAccountDetails.custom_interest_rate ||
                              decryptAccountDetails.interest_rate)
                            ? Math.abs(
                                decryptAccountDetails.current_balance *
                                  ((decryptAccountDetails.updated_interest_rate ||
                                    decryptAccountDetails.custom_interest_rate ||
                                    decryptAccountDetails.interest_rate) /
                                    100 /
                                    12)
                              ).toFixed(2)
                            : decryptAccountDetails?.approx_monthly_cost
                          : 0,
                      initial_minimum_repayment: decryptAccountDetails.minimum_repayment,
                      updated_overdraft_limit: decryptAccountDetails?.updated_overdraft_limit || 0,
                      is_token_expired: true,
                    };
                    if (decryptAccountDetails.updated_minimum_repayment) {
                      responseData.updated_minimum_repayment = decryptAccountDetails.updated_minimum_repayment;
                    }
                    if (decryptAccountDetails.updated_interest_rate) {
                      responseData.updated_interest_rate = decryptAccountDetails.updated_interest_rate;
                    }
                    decryptAccountDetails.is_token_expired = responseData.is_token_expired;
                    await DBManager.dataUpdate(
                      "user_overdraft_account_master",
                      { account_details: await utils.encryptData(decryptAccountDetails) },
                      { user_overdraft_account_id: rowData.user_overdraft_account_id }
                    );
                    return responseData;
                  } else {
                    response.status = false;
                    response.message = resultToken.message;
                    console.log("account info get api response ###############", response);
                    return responseHelper.respondSuccess(res, 200, response);
                  }
                }
              })
            ).then((responseData) => {
              responseData = responseData.filter((element) => {
                if (element != undefined) {
                  return true;
                }
                return false;
              });
              response.data = responseData;
              response.status = true;
              response.message = "Account Listed Successfully.";
              console.log("account info get api response response ###############", response);
              return responseHelper.respondSuccess(res, 200, response);
            });
          });
        }
      } else {
        response.status = true;
        response.message = "Users Account Not Found.";
        console.log("account info get api response response ###############", response);
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      console.log(error);
      console.log("account info get api error ###############", error);
      return responseHelper.respondError(res, error);
    }
  },
};
