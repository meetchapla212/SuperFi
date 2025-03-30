var config = require("./../config/config");
const axios = require("axios").default;
const DB = require("./../common/dbmanager");
const DBManager = new DB();

// This function is used to generate truelayer tokens and update it in database.
const generateTruelayerToken = function (data) {
  return new Promise(async (resolve, reject) => {
    try {
      var resultData = await DBManager.getData("user_bank_account_master", "user_bank_account_id, refresh_token, is_token_expired", {
        _bank_id: data.body.bank_id,
        _user_id: data.user.userId,
      });
      var rowData = resultData?.rows || [];
      var userBankAccountId = rowData?.[0]?.user_bank_account_id || 0;
      var refreshToken = rowData?.[0]?.refresh_token || "";
      var isTokenExpired = rowData?.[0]?.is_token_expired || "";
      if (isTokenExpired) {
        return resolve({ status: false, message: "Token Expired" });
      }
      if (refreshToken && refreshToken.length) {
        const options = {
          method: "post",
          url: `${config.TRUELAYER_AUTH_BASE_URL}/connect/token`,
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          data: {
            grant_type: "refresh_token",
            client_id: config.TRUELAYER_CLIENT_ID,
            client_secret: config.TRUELAYER_SECRET_KEY,
            refresh_token: refreshToken,
          },
        };
        var resultData = await axios.request(options);
        var rowData = resultData?.data || [];
        if (rowData) {
          console.log("truelayer service response ----> Token Generated.");
          resolve({ status: true, data: rowData });
        } else {
          console.log("truelayer service response ----> Token Not Generated.");
          resolve({ status: false, message: "Token Not Generated." });
        }
      } else {
        console.log("truelayer service response ----> Refresh Token Not Found.");
        resolve({ status: false, message: "Refresh Token Not Found." });
      }
    } catch (err) {
      console.log("truelayer service error #######", err);
      if (err?.response?.status == "400" && err?.response?.data?.error == "invalid_grant") {
        await DBManager.dataUpdate("user_bank_account_master", { is_token_expired: 1 }, { user_bank_account_id: userBankAccountId });
      }
      resolve({
        status: false,
        statusCode: err?.response?.status == "400",
        message: err?.response?.data?.error || err?.message || "Token Not Generated.",
      });
    }
  });
};

module.exports = {
  generateTruelayerToken,
};
