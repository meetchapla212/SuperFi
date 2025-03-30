process.env.NODE_ENV = process.env.NODE_ENV || "development";
const DB = require("../common/dbmanager");
const DBManager = new DB();

// This function is used to migrate card brand data to database.
const migrateData = async function () {
  var resultBank = await DBManager.getData("bank_master", "provider_id, bank_name");
  var rowBank = resultBank?.rows || [];
  await Promise.all(
    rowBank.map(async (bank) => {
      var resultCardBrand = await DBManager.getData("card_brand_master", "brand_sku_code", { brand_sku_code: bank.provider_id });
      var rowCardBrand = resultCardBrand?.rows || [];
      if (!rowCardBrand.length) {
        let insertData = {
          brand_name: bank?.bank_name,
          brand_sku_code: bank?.provider_id,
        };
        await DBManager.dataInsert("card_brand_master", insertData);
      }
    })
  ).then(() => {
    console.log("Migrated Successfully.", response);
  });
};
migrateData();
