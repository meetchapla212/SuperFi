//const bcrypt = require("bcrypt");
var config = require("./../config/config");
const fs = require("fs");
const _ = require("lodash");
const { v4: uuidv4 } = require("uuid");
const responseHelper = require("./../common/responseHelper");
const utils = require("./../common/utils");
const DB = require("./../common/dbmanager");
const DBManager = new DB();
const validate = require("../validations/user.validation");
const moment = require("moment");
const { EMAIL_SUBJECTS, DEFAULT_EMAIL_LINKS } = require("../common/constants");
const path = require("path");
const rewardHelper = require("./../common/reward");
const dateFormat = "YYYY-MM-DD HH:mm:ss";
const dayInterval = 10;

module.exports = {
  // This function is used to send email to user form email verification.
  checkUserEmail: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      await validate.checkUserEmail(apiData);
      const { email_id, device_name } = apiData;

      var whereQry = {
        u_email_id: email_id,
      };

      var resultUser = await DBManager.getData("users_master", "*", whereQry);
      var rowUser = resultUser.rows || [];

      if (rowUser.length === 0) {
        var userId = uuidv4();

        var insertQry = {
          user_id: userId,
          u_email_id: email_id,
          device_name: device_name ? device_name : null,
          is_email_verified: 0,
          is_completed: 0,
        };
        await DBManager.dataInsert("users_master", insertQry);
      }

      var template = fs.readFileSync("./email-templates/verify_email.html", "utf8");
      const secret_token = uuidv4();
      const payload = {
        email_id: email_id,
        secret_token: secret_token,
        time: moment.utc().unix(),
      };
      // Token generation
      var verifyToken = utils.createJWT(payload, "10m");
      const verifyUrl = `${config.DOMAIN}/api/auth/verify-email?emailId=${email_id}&token=${verifyToken}`;
      var emailName = email_id.substr(0, email_id.indexOf("@"));
      var userName = rowUser?.[0]?.["first_name"] || emailName || "guest";
      userName = userName.charAt(0).toUpperCase() + userName.slice(1);
      var templateVars = {
        ...DEFAULT_EMAIL_LINKS,
        ...{
          verifyUrl,
          name: userName,
        },
      };

      var mailTemplate = _.template(template)(templateVars);

      var emailResult = await utils.sendEmail(
        email_id,
        EMAIL_SUBJECTS.EMAIL_VERIFICATION.subject,
        EMAIL_SUBJECTS.EMAIL_VERIFICATION.text,
        mailTemplate
      );
      if (emailResult && emailResult.messageId) {
        var resultCheckEmail = await DBManager.getData("verification_email_master", "*", { email_id: email_id });
        var rowCheckEmail = resultCheckEmail?.rows || [];

        if (rowCheckEmail && rowCheckEmail.length > 0) {
          var updateQry = {
            secret_token: secret_token,
          };
          await DBManager.dataUpdate("verification_email_master", updateQry, {
            email_id: email_id,
          });
        } else {
          var insertQry = {
            email_id: email_id,
            secret_token: secret_token,
          };
          await DBManager.dataInsert("verification_email_master", insertQry);
        }

        response = {
          status: true,
          message: "Email sent successfully",
        };
        return responseHelper.respondSuccess(res, 200, response);
      } else {
        response.message = "Email not sent. Please try again later";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to verify users email.
  verifyUserEmail: async function (req, res) {
    var errorMessage = "Link Expired";
    var pageCode = 401; // Invalid Link

    try {
      var apiData = req.query || {};
      const { token, emailId } = apiData;
      if (token) {
        var isRegisterAllow = await DBManager.getKeyValue("app_settings", "setting_value", { setting_key: "new_register_allow" });
        var payload = await utils.decodeToken(token);
        if (payload && payload.status) {
          var { email_id, secret_token } = payload.data;

          // Check if email is valid

          var resultUserCheck = await DBManager.getData("verification_email_master", "*", {
            email_id: email_id,
            secret_token: secret_token,
          });
          var rowUserCheck = resultUserCheck.rows || [];

          if (rowUserCheck && rowUserCheck.length > 0) {
            // CHeck if user is already verified

            var whereUserQry = {
              u_email_id: email_id,
              is_completed: 1,
            };
            var resultUser = await DBManager.getData("users_master", "*", whereUserQry);
            var rowUser = resultUser.rows || [];

            if (rowUser && rowUser.length > 0) {
              const userInfo = rowUser[0];
              const date_of_birth = userInfo.date_of_birth;
              var userAge = moment().diff(date_of_birth, "years");
              if (userAge < 18) {
                // User is under 18
                pageCode = `202`; // Send to Age low page
                errorMessage = "";
              }
              if (userInfo.status !== "active") {
                // User is not active
                pageCode = `203`; // Send to Account paused page
                errorMessage = "";
              } else {
                // Already have verified and connected account
                pageCode = `200##${email_id}##${secret_token}`; // Send to Passcode screen
                errorMessage = "";
              }
            } else if (isRegisterAllow === "0") {
              pageCode = 403; // New Registration closed
              errorMessage = "";
            } else {
              await DBManager.dataUpdate("users_master", { is_email_verified: 1 }, { u_email_id: email_id });
              // Register new account
              pageCode = `201##${email_id}##${secret_token}`; // Send to register page
              errorMessage = "";
            }
          }

          await DBManager.dataHardDelete("verification_email_master", {
            email_id: email_id,
          });
        } else {
          pageCode = `401##${emailId || ""}`; // Token Expired
          errorMessage = "Link Expired";
        }
      }

      var template = fs.readFileSync("./html-templates/verifications.html", "utf8");

      var pageParams = Object.assign({
        pageUrl: `superfi://page/verification/${pageCode}`,
        errorMessage: errorMessage,
      });

      var pageTemplate = _.template(template)(pageParams);
      res.send(pageTemplate);

      //return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to register user.
  registerUser: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      await validate.checkRegisterUser(apiData);
      const { first_name, surname, email_id, passcode, marketing_preferences, date_of_birth, device_name, device_id, device_token } = apiData;
      const hashPasscode = utils.createHex(passcode);

      var whereQry = {
        u_email_id: email_id,
      };

      var resultUser = await DBManager.getData("users_master", "*", whereQry);
      var rowUser = resultUser.rows || [];

      if (rowUser.length > 0) {
        // Already have verified and connected account
        var userInfo = rowUser[0];
        if (userInfo.is_completed === 1) {
          response = {
            status: false,
            errorCode: 100,
            message: "Email already registered",
          };
          return responseHelper.respondSuccess(res, 200, response);
        } else {
          var updateQry = {
            first_name: first_name,
            last_name: surname,
            u_email_id: email_id,
            u_password: hashPasscode,
            date_of_birth: date_of_birth,
            device_name: device_name || "",
            is_email_verified: 1,
            user_preference_setting: JSON.stringify({
              marketing_preferences: marketing_preferences,
            }),
            is_completed: 1,
          };
          await DBManager.dataUpdate("users_master", updateQry, whereQry);
          var payload = {
            userId: userInfo.user_id,
            email_id: email_id,
          };
          var token = utils.createJWT(payload);
          response = {
            status: true,
            message: "User updated successfully",
            data: {
              token,
              info: {
                id: userInfo.user_id,
                email_id: email_id,
                first_name: first_name,
                last_name: surname,
              },
            },
          };
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        // New account request to verify
        var userId = uuidv4();

        var insertQry = {
          user_id: userId,
          first_name: first_name,
          last_name: surname,
          u_email_id: email_id,
          u_password: hashPasscode,
          date_of_birth: date_of_birth,
          device_name: device_name || "",
          is_email_verified: 1,
          user_preference_setting: JSON.stringify({
            marketing_preferences: marketing_preferences,
          }),
        };
        await DBManager.dataInsert("users_master", insertQry);

        await DBManager.dataHardDelete("user_onboarding_progress_master", {
          email_id: email_id,
        });

        var userAge = moment().diff(date_of_birth, "years");
        if (userAge < 18) {
          // User is under 18
          response = {
            status: false,
            errorCode: 101,
            message: "Unfortunately we can’t offer SuperFi to you",
          };
          return responseHelper.respondSuccess(res, 200, response);
        }

        var payload = {
          userId: userId,
          email_id: email_id,
        };
        var token = utils.createJWT(payload);

        // Notification token
        if (device_id && device_token) {
          var insertNotificationData = {
            _user_id: userId,
            device_id: device_id,
            device_type: device_name,
            device_token: device_token,
          };
          await DBManager.dataInsert("app_notification_token_master", insertNotificationData);
        }

        response = {
          status: true,
          message: "Account created successfully",
          data: {
            token,
            info: {
              id: userId,
              email_id: email_id,
              first_name: first_name,
              last_name: surname,
            },
          },
        };

        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to login user.
  loginUser: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      await validate.checkLogin(apiData);
      const { email_id, passcode, device_name, device_id, device_token } = apiData;

      var whereQry = {
        u_email_id: email_id,
        is_email_verified: 1,
      };

      var resultUser = await DBManager.getData("users_master", "*", whereQry);
      var rowUser = resultUser.rows || [];

      if (rowUser.length > 0) {
        var userInfo = rowUser[0];
        const userPasscode = utils.createHex(passcode);
        if (userInfo.u_password === userPasscode) {
          if (userInfo.status !== "active") {
            response = {
              status: false,
              errorCode: 102,
              message: `Your account is ${userInfo.status}`,
            };
            return responseHelper.respondSuccess(res, 200, response);
          }

          var payload = {
            userId: userInfo.user_id,
            email_id: userInfo.u_email_id,
          };
          var token = utils.createJWT(payload);

          response = {
            status: true,
            message: "Login successful",
            data: {
              token,
              info: {
                id: userInfo.user_id,
                user_unique_id: userInfo.user_unique_id,
                email_id: userInfo.u_email_id,
                first_name: userInfo.first_name,
                last_name: userInfo.last_name,
                date_of_birth: userInfo.date_of_birth,
                superfi_rating: userInfo.superfi_rating || "",
                home_address: userInfo.address || "",
                user_preference_setting: userInfo.user_preference_setting,
              },
            },
          };

          var updateQry = {
            last_login_date: utils.getCurrentDate(),
            last_login_ip: req?.ip || "",
            device_name: device_name ? device_name : null,
          };
          await DBManager.dataUpdate("users_master", updateQry, {
            user_id: userInfo.user_id,
          });

          await DBManager.runQuery(
            `UPDATE users_login_history SET is_deleted = 1 where _user_id = '${userInfo.user_id}' AND logged_in_at::timestamp < now() - '${dayInterval} days'::interval AND is_deleted = 0`
          );
          var insertQry = {
            _user_id: userInfo.user_id,
            ip_address: req?.ip || "",
            logged_in_at: moment.utc().format(dateFormat),
          };
          await DBManager.dataInsert("users_login_history", insertQry);

          await rewardHelper.checkReward(userInfo.user_id, "login");

          if (device_id && device_token) {
            var resultNotificationToken = await DBManager.getData("app_notification_token_master", "notification_token_id", {
              _user_id: userInfo.user_id,
              device_id: device_id,
            });
            var rowNotificationToken = resultNotificationToken.rows || [];
            if (rowNotificationToken && rowNotificationToken.length) {
              await DBManager.dataUpdate(
                "app_notification_token_master",
                { device_token: device_token },
                { notification_token_id: rowNotificationToken[0].notification_token_id }
              );
            } else {
              var insertNotificationData = {
                _user_id: userInfo.user_id,
                device_id: device_id,
                device_type: device_name || "",
                device_token: device_token,
              };
              await DBManager.dataInsert("app_notification_token_master", insertNotificationData);
            }
          }
          return responseHelper.respondSuccess(res, 200, response);
        } else {
          response.message = "Invalid passcode";
          return responseHelper.respondSuccess(res, 200, response);
        }
      } else {
        response.message = "Invalid email or password";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to create and send temporary passcode to user via email.
  forgotPasscode: async function (req, res) {
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
        is_email_verified: 1,
      };

      var resultUser = await DBManager.getData("users_master", "*", whereQry);
      var rowUser = resultUser.rows || [];

      if (rowUser.length > 0) {
        const passcode = utils.generateRandomNumber(4);
        const userPasscode = utils.createHex(`${passcode}`);
        var template = fs.readFileSync("./email-templates/forgot_passcode.html", "utf8");
        `/verify-url`;
        const verifyUrl = `${config.DOMAIN}/api/user/superfi/verify-url?type=forgot_passcode&email_id=${email_id}`;
        var emailName = email_id.substr(0, email_id.indexOf("@"));
        var userName = rowUser?.[0]?.["first_name"] || emailName || "guest";
        userName = userName.charAt(0).toUpperCase() + userName.slice(1);
        var templateVars = {
          ...DEFAULT_EMAIL_LINKS,
          ...{
            verifyUrl,
            name: userName,
            tempPasscode: passcode,
          },
        };

        var mailTemplate = _.template(template)(templateVars);

        var emailResult = await utils.sendEmail(
          email_id,
          EMAIL_SUBJECTS.EMAIL_FORGOT_PASSCODE.subject,
          EMAIL_SUBJECTS.EMAIL_FORGOT_PASSCODE.text,
          mailTemplate
        );
        if (emailResult && emailResult.messageId) {
          await DBManager.dataUpdate("users_master", { u_password: userPasscode }, { u_email_id: email_id });

          response = {
            status: true,
            message: "New passcode sent to your email",
          };
        } else {
          response.message = "Email not sent.  Please try again later";
        }
        return responseHelper.respondSuccess(res, 200, response);
      } else {
        response.message = "No account found with this email";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get users profile details.
  getUserProfile: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { userId } = req.user;

      var whereQry = {
        user_id: userId,
      };

      var resultUser = await DBManager.getData("users_master", "*", whereQry);
      var rowUser = resultUser.rows || [];

      if (rowUser.length > 0) {
        var userInfo = rowUser[0];
        response = {
          status: true,
          message: "User profile",
          data: {
            id: userInfo.user_id,
            user_unique_id: userInfo.user_unique_id,
            email_id: userInfo.u_email_id,
            first_name: userInfo.first_name,
            last_name: userInfo.last_name,
            date_of_birth: userInfo.date_of_birth,
            superfi_rating: userInfo.superfi_rating || "",
            home_address: userInfo.address || "",
            user_preference_setting: userInfo.user_preference_setting,
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
  // This function is used to save device token for push notification.
  savePushNotificationToken: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { userId } = req.user;
      var apiData = req.body;
      await validate.checkPushToken(apiData);
      const { device_id, device_type, device_token } = apiData;

      var whereQry = {
        device_id: device_id,
        device_type: device_type,
        _user_id: userId,
      };

      var resultData = await DBManager.getData("app_notification_token_master", "*", whereQry);
      var rowData = resultData.rows || [];

      if (rowData.length > 0) {
        var notification_token_id = rowData[0].notification_token_id;
        await DBManager.dataUpdate("app_notification_token_master", { device_token: device_token }, { notification_token_id: notification_token_id });
      } else {
        var insertQry = {
          _user_id: userId,
          device_id: device_id,
          device_type: device_type,
          device_token: device_token,
        };
        await DBManager.dataInsert("app_notification_token_master", insertQry);
      }

      response = {
        status: true,
        message: "Token save successfully",
      };

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get user onboarding steps.
  getOnboardingProgress: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.query || {};
      const { email_id } = apiData;
      await validate.checkOnboardingEmail(apiData);
      // if (!email_id) {
      //   response.message = "Email id is required";
      //   return responseHelper.respondSuccess(res, 200, response);
      // }
      var whereQry = {
        email_id: email_id,
      };

      var resultData = await DBManager.getData("user_onboarding_progress_master", "*", whereQry);
      var rowData = resultData.rows || [];

      if (rowData.length > 0) {
        var userInfo = rowData[0];
        response = {
          status: true,
          message: "User Onboarding Progress",
          data: userInfo?.user_progress || {},
        };
      } else {
        response.message = "No progress found with this email";
      }
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to save user onboarding steps.
  saveOnboardingProgress: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body || {};
      await validate.checkOnboardingProgress(apiData);
      const { email_id, progress } = apiData;

      var whereQry = {
        email_id: email_id,
      };

      var user_progress = JSON.stringify(progress);

      var resultData = await DBManager.getData("user_onboarding_progress_master", "*", whereQry);
      var rowData = resultData.rows || [];

      if (rowData.length > 0) {
        await DBManager.dataUpdate("user_onboarding_progress_master", { user_progress: user_progress }, whereQry);
      } else {
        var insertQry = {
          email_id: email_id,
          user_progress: user_progress,
        };
        await DBManager.dataInsert("user_onboarding_progress_master", insertQry);
      }

      response = {
        status: true,
        message: "Onboarding Progress save successfully",
      };

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update user passcode.
  changePasscode: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body || {};
      await validate.checkPasscode(apiData);
      const { userId } = req.user;
      const { passcode } = apiData;

      var whereQry = {
        user_id: userId,
      };

      var resultUser = await DBManager.getData("users_master", "*", whereQry);
      var rowUser = resultUser?.rows || [];

      if (rowUser.length > 0) {
        const hashPasscode = utils.createHex(passcode);
        await DBManager.dataUpdate("users_master", { u_password: hashPasscode }, whereQry);
        response.status = true;
        response.message = "Passcode changed successfully.";
      } else {
        response.message = "User not found.";
      }

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to rate superfi application.
  rateSuperfi: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body || {};
      await validate.checkSuperfiRating(apiData);
      const { userId } = req.user;
      const { superfi_rating } = apiData;

      var whereQry = {
        user_id: userId,
      };

      var resultUser = await DBManager.getData("users_master", "*", whereQry);
      var rowUser = resultUser?.rows || [];

      if (rowUser.length > 0) {
        rowUser = rowUser?.[0] || {};
        await DBManager.dataUpdate("users_master", { superfi_rating: superfi_rating }, whereQry);
        response.status = true;
        response.message = "Superfi rated successfully.";

        return responseHelper.respondSuccess(res, 200, response);
      } else {
        response.message = "User not found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update user preference settings.
  updateUserPreference: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body || {};
      await validate.checkUserPreference(apiData);
      const { userId } = req.user;
      const { device_id, device_token, device_name } = apiData;
      var whereQry = {
        user_id: userId,
      };

      var resultUser = await DBManager.getData("users_master", "*", whereQry);
      var rowUser = resultUser?.rows || [];

      if (rowUser.length > 0) {
        var userPreferenceSetting = rowUser?.[0]?.user_preference_setting || {};

        Object.keys(apiData).map(function (key) {
          userPreferenceSetting[key] = apiData[key];
        });

        await DBManager.dataUpdate("users_master", { user_preference_setting: JSON.stringify(userPreferenceSetting) }, { user_id: userId });
        // Add or update device token for notification.
        if (device_id && device_token) {
          var resultNotificationToken = await DBManager.getData("app_notification_token_master", "notification_token_id", {
            _user_id: userId,
            device_id: device_id,
          });
          var rowNotificationToken = resultNotificationToken.rows || [];
          if (rowNotificationToken && rowNotificationToken.length) {
            await DBManager.dataUpdate(
              "app_notification_token_master",
              { device_token: device_token },
              { notification_token_id: rowNotificationToken[0].notification_token_id }
            );
          } else {
            var insertNotificationData = {
              _user_id: userId,
              device_id: device_id,
              device_type: device_name || "",
              device_token: device_token,
            };
            await DBManager.dataInsert("app_notification_token_master", insertNotificationData);
          }
        }

        response.status = true;
        response.message = "User preference setting updated.";
      } else {
        response.message = "User not found.";
      }

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to logout user.
  logoutUser: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { device_id } = apiData;
      const { userId } = req.user;

      await validate.checkLogout(apiData);
      var resultDeviceToken = await DBManager.getData("app_notification_token_master", "*", { _user_id: userId, device_id: device_id });
      var rowDeviceToken = resultDeviceToken.rows || [];
      if (rowDeviceToken && rowDeviceToken.length) {
        await DBManager.dataHardDelete("app_notification_token_master", { _user_id: userId, device_id: device_id });
        response.status = true;
        response.message = "Logout Successful.";
        return responseHelper.respondSuccess(res, 200, response);
      } else {
        response.status = true;
        response.message = "User Device Not Found.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to logout user.
  updateTotalDownloads: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var resultSettings = await DBManager.getData("app_settings", "*", { setting_key: "total_app_downloads" });
      var rowSettings = resultSettings?.rows || [];
      if (rowSettings.length) {
        let downloadsCount = parseInt(rowSettings[0].setting_value) + 1;
        await DBManager.dataUpdate("app_settings", { setting_value: downloadsCount }, { setting_key: "total_app_downloads" });
        response.status = true;
        response.message = "App Downloads Updated.";
        return responseHelper.respondSuccess(res, 200, response);
      }
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
};
