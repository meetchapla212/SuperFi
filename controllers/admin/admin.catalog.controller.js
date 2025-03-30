var config = require("../../config/config");
const fs = require("fs");
const _ = require("lodash");
const { v4: uuidv4 } = require("uuid");
const responseHelper = require("../../common/responseHelper");
const utils = require("../../common/utils");
const DB = require("../../common/dbmanager");
const DBManager = new DB();
const validate = require("../../validations/admin.validation");
var slugify = require("slugify");

module.exports = {
  // This function is used to get all card types.
  getAllCards: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      var sqlQry = `SELECT cb.brand_name, cb.brand_sku_code, ct.* FROM card_brand_master as cb, card_brand_type_master as ct WHERE cb.card_brand_id = ct._card_brand_id AND cb.is_deleted = 0 AND ct.is_deleted = 0 ORDER BY cb.brand_name, ct.card_type_name ASC`;
      var results = await DBManager.runQuery(sqlQry);
      var rows = results?.rows || [];

      response = {
        status: true,
        message: "Success",
        data: rows,
      };

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
  // This function is used to add, edit and delete card type.
  cardAction: async function (req, res) {
    var response = {
      status: false,
      message: "Server error! Please try again later",
    };
    try {
      const { action } = req.body;
      const { cardId } = req.params;

      if (!action || !cardId) {
        response.message = "Invalid request";
        return responseHelper.respondSuccess(res, 200, response);
      }

      if (action == "delete") {
        var sqlDeleteQry = `UPDATE card_brand_type_master SET is_deleted = '1' WHERE card_type_id = '${cardId}'`;
        await DBManager.runQuery(sqlDeleteQry);

        response = {
          status: true,
          message: "Card deleted successfully!",
        };
        return responseHelper.respondSuccess(res, 200, response);
      } else if (action == "edit" || action == "add") {
        const { card_type_name, interest_rate, brand_name, brand_sku_code } = req.body;

        var dataUpdate = {
          card_type_name: card_type_name,
          interest_rate: interest_rate,
        };

        if (!!req.file) {
          var fileName = `${config.DOMAIN}/${req.file.filename}`;
          dataUpdate["card_type_image"] = fileName;
        }

        if (action === "add") {
          var brandTypeId = await DBManager.getKeyValue("card_brand_master", "card_brand_id", { brand_name: brand_name });
          if (brandTypeId) {
            dataUpdate["_card_brand_id"] = brandTypeId;
          } else {
            var brandDataInsert = {
              brand_name: brand_name,
              brand_sku_code: slugify(brand_name, { lower: true }),
            };
            var resultInsert = await DBManager.dataInsert("card_brand_master", brandDataInsert, true, "card_brand_id");
            dataUpdate["_card_brand_id"] = resultInsert?.rows?.[0]?.["card_brand_id"] || null;
          }

          await DBManager.dataInsert("card_brand_type_master", dataUpdate);

          response = {
            status: true,
            message: "Card save successfully!",
          };
          return responseHelper.respondSuccess(res, 200, response);
        }

        if (action === "edit") {
          await DBManager.dataUpdate("card_brand_type_master", dataUpdate, {
            card_type_id: cardId,
          });

          await DBManager.dataUpdate(
            "card_brand_master",
            { brand_name: brand_name },
            {
              brand_sku_code: brand_sku_code,
            }
          );
          response = {
            status: true,
            message: "Card updated successfully!",
          };
          return responseHelper.respondSuccess(res, 200, response);
        }
        return responseHelper.respondSuccess(res, 200, response);
      }

      return responseHelper.respondSuccess(res, 200, response);
    } catch (error) {
      //console.log(error);
      return responseHelper.respondError(res, error);
    }
  },
};
