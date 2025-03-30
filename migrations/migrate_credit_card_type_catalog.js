process.env.NODE_ENV = process.env.NODE_ENV || "development";
const DB = require("../common/dbmanager");
const DBManager = new DB();
const xlsxFile = require("read-excel-file/node");

// This function is used to migrate card brand type data to database.
xlsxFile("./book1.xlsx", { sheet: "Sheet1" }).then((rows) => {
  rows.slice(150, 201).forEach(async (rowElement) => {
    if (rowElement[0] != null) {
      let resultData = await DBManager.getData("card_brand_master", "card_brand_id", { brand_name: rowElement[0] });
      let resultRow = resultData?.rows || [];
      console.log(resultRow);
      if (resultRow && resultRow.length) {
        var insertQry = {
          _card_brand_id: resultRow[0].card_brand_id,
          card_type_name: rowElement[1].replace("'", ""),
          interest_rate: rowElement[2] * 100,
          card_type_image: "default.png",
        };
        console.log(insertQry);
        await DBManager.dataInsert("card_brand_type_master", insertQry);
      }
    }
  });
});
