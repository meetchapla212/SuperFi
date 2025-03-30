const responseHelper = require("../../common/responseHelper");
const utils = require("../../common/utils");
const DB = require("../../common/dbmanager");
const DBManager = new DB();

module.exports = {
  // This function is used to get all admins.
  getAllAdmins: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var resultAdmins = await DBManager.getData("admin_master", "*");
      var rowAdmins = resultAdmins.rows || [];
      response = {
        status: true,
        data: rowAdmins,
      };
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to get create new admin.
  createNewAdminUser: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var apiData = req.body;
      const { email_id, password } = apiData;

      const newPassword = utils.createHex(password);

      var insertQry = {
        admin_name: "Admin",
        u_email_id: email_id,
        u_password: newPassword,
      };

      await DBManager.dataInsert("admin_master", insertQry);
      response.status = true;
      response.message = "Admin user created successfully";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to update admin password.
  updateAdminUser: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };

    const { adminId } = req.params || {};

    if (!adminId) {
      response.message = "Admin Id is required!";
      return responseHelper.respondSuccess(res, 404, response);
    }

    try {
      const { password } = req.body || {};
      const newPassword = utils.createHex(password);

      var updateQry = {
        u_password: newPassword,
      };
      var whereQry = {
        admin_id: adminId,
      };
      await DBManager.dataUpdate("admin_master", updateQry, whereQry);
      response.status = true;
      response.message = "Admin updated successfully";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to delete admin.
  deleteAdminUser: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { adminId } = req.params || {};

      if (!adminId) {
        response.message = "Admin Id is required!";
        return re;
        sponseHelper.respondSuccess(res, 404, response);
      }
      await DBManager.dataDelete("admin_master", {
        admin_id: adminId,
      });

      response.status = true;
      response.message = "Admin deleted successfully";
      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      return responseHelper.respondError(res, error);
    }
  },
};
