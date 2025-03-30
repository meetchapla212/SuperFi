process.env.NODE_ENV = process.env.NODE_ENV || "development";
const DB = require("../common/dbmanager");
const DBManager = new DB();
const xlsxFile = require("read-excel-file/node");

// This function is used to migrate card brand data to database.
xlsxFile("./book1.xlsx", { sheet: "Sheet2" }).then((rows) => {
  rows.slice(1).forEach(async (rowElement) => {
    if (rowElement[0] != null) {
      var insertQry = {
        brand_name: rowElement[0],
        brand_sku_code: rowElement[0]
          .toLowerCase()
          .replace(/ /g, "_")
          .replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, ""),
        brand_image: "default.png",
      };
      console.log(insertQry);
      await DBManager.dataInsert("card_brand_master", insertQry);
    }
  });
});
