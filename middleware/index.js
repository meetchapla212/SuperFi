const jwt = require("jsonwebtoken");
const responseHelper = require("../common/responseHelper");
const utils = require("../common/utils");
const config = require("../config/config");
const DB = require("../common/dbmanager");
const DBManager = new DB();

module.exports = {
  // This function is used to verify jwt user token.
  verifyToken: async function (req, res, next) {
    var response = {
      status: false,
      message: "Invalid Authorization",
      errorCode: 0,
    };

    var method = req.method;
    if (method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Origin", "*");
      next();
    } else {
      try {
        const authHeader = req.body.token || req.query.token || req.headers["authorization"];

        if (authHeader) {
          req.user = await utils.verifyUser(authHeader);
          var { userId } = req.user || {};
          if (userId) {
            var resultUser = await DBManager.getData("users_master", "*", {
              user_id: userId,
            });
            var rowUser = resultUser?.rows?.[0] || {};
            if (rowUser && rowUser.user_id) {
              if (rowUser.status === "active") {
                next();
              } else {
                response.errorCode = 101;
                response.message = "Your account is inactive";
                return responseHelper.respondSuccess(res, 401, response);
              }
            } else {
              response.errorCode = 102;
              response.message = "Account is deleted";
              return responseHelper.respondSuccess(res, 401, response);
            }
          } else {
            next();
          }
        } else {
          return responseHelper.respondSuccess(res, 401, response);
        }
      } catch (error) {
        return responseHelper.respondError(res, error);
      }
    }
  },
  // This function is used to verify admin jwt token.
  verifyAdminToken: async function (req, res, next) {
    var response = {
      status: false,
      message: "Invalid Authorization",
    };
    var method = req.method;

    if (method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Origin", "*");
      next();
    } else {
      try {
        const authHeader = req.headers["authorization"];
        if (authHeader) {
          req.admin = await utils.verifyAdmin(authHeader);
          next();
        } else {
          return responseHelper.respondSuccess(res, 401, response);
        }
      } catch (error) {
        return responseHelper.respondError(res, error);
      }
    }
  },
  // This function is used to verify user api key.
  verifyApiKey: function (req, res, next) {
    var response = {
      status: false,
      message: "Invalid Request, Missing Key",
    };

    var method = req.method;

    if (method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Origin", "*");
      next();
    } else {
      try {
        const authHeader = req.headers["x-api-key"] || "";
        if (authHeader && authHeader != "" && authHeader === config.MOBILE_API_KEY) {
          next();
        } else {
          return responseHelper.respondSuccess(res, 200, response);
        }
      } catch (error) {
        return responseHelper.respondError(res, error);
      }
    }
  },
};
