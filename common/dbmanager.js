const { Client } = require("pg");
const { v4: uuidv4, NIL: NIL_UUID } = require("uuid");
const moment = require("moment");
const dateFormat = "YYYY-MM-DD HH:mm:ss";

var config = require("../config/config");

module.exports = class DBManager {
  // This function is to run sql query.
  async runQuery(sqlQry) {
    var connection = new Client({
      host: config.DB_HOST,
      user: config.DB_USERNAME,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      port: config.DB_PORT,
    });

    connection.connect();

    return new Promise((resolve, reject) => {
      connection.query(sqlQry, function (err, res) {
        connection.end();
        if (err) {
          console.error("sqlQry> ", sqlQry);
          console.error("Error", err.message);
          var errorObj = {
            message: `Critical Error! Please try again later`,
            code: 500,
          };
          reject(errorObj);
          return;
        } else {
          resolve(res);
        }
      });
    });
  }
  // This function is to insert sql data.
  async dataInsert(tableName, value, isReturnId = false, primaryId = "") {
    value.date_created = moment.utc().format(dateFormat);

    const fields = Object.keys(value)
      .map((key) => `${key}`)
      .join(",");
    const values = Object.values(value)
      .map((value) => {
        return typeof value === "string" ? `E'${value}'` : `${value}`;
      })
      .join(",");

    var sqlQry = "INSERT INTO " + tableName + " (" + fields + ") values (" + values + ") ";

    if (isReturnId) {
      sqlQry += " RETURNING " + primaryId;
    }

    return new Promise((resolve, reject) => {
      this.runQuery(sqlQry)
        .then((data) => {
          resolve(data);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }
  // This function is to update sql data.
  async dataUpdate(tableName, dataObj, whereObj = {}, condition = "AND") {
    dataObj.date_modified = moment.utc().format(dateFormat);

    const fieldsName = Object.keys(dataObj)
      .map(function (key, index) {
        var value = typeof dataObj[key] === "string" ? `E'${dataObj[key]}'` : `${dataObj[key]}`;
        return `${key} = ${value}`;
      })
      .join(",");

    const wheryQry = Object.keys(whereObj)
      .map(function (key, index) {
        var value = typeof whereObj[key] === "string" ? `'${whereObj[key]}'` : `${whereObj[key]}`;
        return `${key} = ${value}`;
      })
      .join(" " + condition + " ");

    var sqlQry = "UPDATE " + tableName + " SET " + fieldsName;
    if (Object.keys(whereObj).length > 0) {
      sqlQry += " WHERE " + wheryQry;
    }

    return new Promise((resolve, reject) => {
      this.runQuery(sqlQry)
        .then((data) => {
          resolve(data);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }
  // This function is to get sql data.
  async getData(tableName, fieldsObj = "*", whereObj = {}, condition = "AND", offset = -1, limit = -1, orderBy = "") {
    const wheryQry = Object.keys(whereObj)
      .map(function (key, index) {
        var value = typeof whereObj[key] === "string" ? `'${whereObj[key]}'` : `${whereObj[key]}`;
        return `${key} = ${value}`;
      })
      .join(" " + condition + " ");

    var sqlQry = "SELECT " + fieldsObj + " FROM " + tableName;
    if (Object.keys(whereObj).length > 0) {
      sqlQry += " WHERE (" + wheryQry + ")";
      sqlQry += " AND is_deleted = 0";
    } else {
      sqlQry += " WHERE is_deleted = 0";
    }
    if (orderBy != "") {
      sqlQry += orderBy;
    }
    if (offset >= 0 && limit >= 0) {
      sqlQry += `OFFSET ${offset} LIMIT ${limit}`;
    }
    return new Promise((resolve, reject) => {
      this.runQuery(sqlQry)
        .then((data) => {
          resolve(data);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }
  // This function is to soft delete sql data.
  async dataDelete(tableName, whereObj = {}, condition = "AND") {
    const wheryQry = Object.keys(whereObj)
      .map(function (key, index) {
        var value = typeof whereObj[key] === "string" ? `'${whereObj[key]}'` : `${whereObj[key]}`;
        return `${key} = ${value}`;
      })
      .join(" " + condition + " ");

    var sqlQry = "UPDATE " + tableName + " SET is_deleted = 1";
    if (Object.keys(whereObj).length > 0) {
      sqlQry += " WHERE " + wheryQry;
    }
    return new Promise((resolve, reject) => {
      this.runQuery(sqlQry)
        .then((data) => {
          resolve(data);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }
  // This function is to hard delete sql data.
  async dataHardDelete(tableName, whereObj = {}, condition = "AND") {
    const wheryQry = Object.keys(whereObj)
      .map(function (key, index) {
        var value = typeof whereObj[key] === "string" ? `'${whereObj[key]}'` : `${whereObj[key]}`;
        return `${key} = ${value}`;
      })
      .join(" " + condition + " ");

    var sqlQry = "DELETE FROM " + tableName + " ";
    if (Object.keys(whereObj).length > 0) {
      sqlQry += " WHERE " + wheryQry;

      return new Promise((resolve, reject) => {
        this.runQuery(sqlQry)
          .then((data) => {
            resolve(data);
          })
          .catch((error) => {
            reject(error);
          });
      });
    }
  }
  // This function is to count sql records.
  async countRecord(tableName, whereObj = {}) {
    const whereQry = Object.keys(whereObj).map(function (key, index) {
      return `${key}='${whereObj[key]}'`;
    });

    let sqlQry = `SELECT COUNT(*) as total FROM ${tableName}`;

    if (Object.keys(whereObj).length > 0) {
      sqlQry += " WHERE (" + whereQry + ")";
      sqlQry += ` AND is_deleted = 0`;
    } else {
      sqlQry += ` WHERE is_deleted = 0`;
    }

    return new Promise((resolve, reject) => {
      this.runQuery(sqlQry)
        .then((data) => {
          resolve(data);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }
  // This function is to get sql key value.
  async getKeyValue(tableName, fieldName, whereObj = {}) {
    const wheryQry = Object.keys(whereObj)
      .map(function (key, index) {
        var value = typeof whereObj[key] === "string" ? `'${whereObj[key]}'` : `${whereObj[key]}`;
        return `${key} = ${value}`;
      })
      .join(" AND ");

    if (fieldName !== "") {
      var sqlQry = "SELECT " + fieldName + " FROM " + tableName;
      if (Object.keys(whereObj).length > 0) {
        sqlQry += " WHERE (" + wheryQry + ")";
        sqlQry += " AND is_deleted = 0";
      } else {
        sqlQry += " WHERE is_deleted = 0";
      }
    }
    try {
      var results = await this.runQuery(sqlQry);
      var rows = results?.rows || [];
      if (rows && rows.length > 0) {
        return rows[0][fieldName] || false;
      }
      return false;
    } catch (error) {}
    return false;
  }
};
