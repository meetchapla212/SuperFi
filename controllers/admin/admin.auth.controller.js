//const bcrypt = require("bcrypt");
var config = require("../../config/config");
const fs = require("fs");
const _ = require("lodash");
const { v4: uuidv4 } = require("uuid");
const responseHelper = require("../../common/responseHelper");
const utils = require("../../common/utils");
const DB = require("../../common/dbmanager");
const DBManager = new DB();
const validate = require("../../validations/admin.validation");
const moment = require("moment");
const { EMAIL_SUBJECTS, DEFAULT_EMAIL_LINKS } = require("../../common/constants");
const path = require("path");

module.exports = {
  // This function is used to login admin.
  loginAdmin: async function (req, res) {
    var response = {
      status: false,
      message: { password: "Server error! Please try again later" },
    };
    try {
      var apiData = req.body;
      await validate.checkLogin(apiData);
      const { email_id, password } = apiData;

      var whereQry = {
        u_email_id: email_id,
      };

      var resultUser = await DBManager.getData("admin_master", "*", whereQry);
      var rowUser = resultUser.rows || [];

      if (rowUser.length > 0) {
        var userInfo = rowUser[0];
        const userPassword = utils.createHex(password);
        if (userInfo.u_password === userPassword) {
          var payload = {
            adminId: userInfo.admin_id,
            email_id: userInfo.u_email_id,
          };
          var token = utils.createAdminJWT(payload);

          response = {
            status: true,
            message: "Login successful",
            data: {
              token,
              info: {
                id: userInfo.admin_id,
                name: userInfo.admin_name,
              },
            },
          };

          return responseHelper.respondSuccess(res, 200, response);
        } else {
          response.message = {
            password: "Password incorrect. Please try again",
          };
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        response.message = { email: "Invalid email address" };
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to create and provide temporary password to admin via email.
  forgotPassword: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      await validate.checkUserEmail(apiData);
      const { email_id } = apiData;

      var whereQry = {
        u_email_id: email_id,
        status: "active",
      };

      var resultUser = await DBManager.getData("admin_master", "*", whereQry);
      var rowUser = resultUser.rows || [];

      if (rowUser.length > 0) {
        const passcode = utils.generateRandomString(10);
        const userPasscode = utils.createHex(`${passcode}`);
        var template = fs.readFileSync("./email-templates/admin_forgot_passcode.html", "utf8");

        var adminName = rowUser?.[0]?.["admin_name"] || "Admin";
        var templateVars = {
          ...DEFAULT_EMAIL_LINKS,
          ...{
            name: adminName,
            tempPasscode: passcode,
            appUrl: `${config.ADMIN_URL}`,
          },
        };

        var mailTemplate = _.template(template)(templateVars);

        var emailResult = await utils.sendEmail(
          email_id,
          EMAIL_SUBJECTS.ADMIN_EMAIL_FORGOT_PASSCODE.subject,
          EMAIL_SUBJECTS.ADMIN_EMAIL_FORGOT_PASSCODE.text,
          mailTemplate
        );
        if (emailResult && emailResult.messageId) {
          await DBManager.dataUpdate("admin_master", { u_password: userPasscode }, { u_email_id: email_id });

          response = {
            status: true,
            message: "New password sent to your email",
          };
        } else {
          response.message = "Email not sent. Please try again later";
        }
        return responseHelper.respondSuccess(res, 200, response);
      } else {
        response.message = "No admin account found with this email";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get admin profile.
  getAdminProfile: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { adminId } = req.admin;

      var whereQry = {
        admin_id: adminId,
      };

      var resultUser = await DBManager.getData("admin_master", "*", whereQry);
      var rowUser = resultUser.rows || [];

      if (rowUser.length > 0) {
        var userInfo = rowUser[0];
        response = {
          status: true,
          message: "Admin profile",
          data: {
            id: userInfo.admin_id,
            name: userInfo.admin_name,
          },
        };
      } else {
        response.message = "No account found with this email";
      }
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
};
