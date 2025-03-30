const Joi = require("joi");
var Promise = require("promise");

// This function is used to validate provider_id and api type.
const checkBankProviderId = function (body) {
  const schema = Joi.object()
    .keys({
      provider_id: Joi.required(),
      type: Joi.string().valid("connect", "reconnect", "reconnect-profile").optional(),
    })
    .unknown(true);
  return new Promise((resolve, reject) => {
    const { value, error, warning } = schema.validate(body);
    if (error) {
      reject({ status_code: 400, message: error.details[0].message });
    } else {
      resolve(value);
    }
  });
};
// This function is used to validate bank exchange code.
const checkBankAuthCode = function (body) {
  const schema = Joi.object()
    .keys({
      code: Joi.string().required(),
    })
    .unknown(true);
  return new Promise((resolve, reject) => {
    const { value, error, warning } = schema.validate(body);
    if (error) {
      reject({ status_code: 400, message: error.details[0].message });
    } else {
      resolve(value);
    }
  });
};
// This function is used to validate bank id.
const checkBankId = function (body) {
  const schema = Joi.object()
    .keys({
      bank_id: Joi.number().required(),
    })
    .unknown(true);
  return new Promise((resolve, reject) => {
    const { value, error, warning } = schema.validate(body);
    if (error) {
      reject({ status_code: 400, message: error.details[0].message });
    } else {
      resolve(value);
    }
  });
};
// This function is used to validate bank and account id.
const checkAccountId = function (body) {
  const schema = Joi.object()
    .keys({
      bank_id: Joi.number().required(),
      account_id: Joi.string().required(),
    })
    .unknown(true);
  return new Promise((resolve, reject) => {
    const { value, error, warning } = schema.validate(body);
    if (error) {
      reject({ status_code: 400, message: error.details[0].message });
    } else {
      resolve(value);
    }
  });
};
// This function is used to validate card data.
const checkCardData = function (body) {
  const schema = Joi.array().items(
    Joi.object()
      .keys({
        bank_id: Joi.number().required(),
        account_id: Joi.string().required(),
        partial_card_number: Joi.string().optional(),
        card_display_name: Joi.string().optional(),
        card_type_id: Joi.optional(),
        custom_brand_type_name: Joi.string().when("card_type_id", { is: null, then: Joi.string().required() }),
        custom_interest_rate: Joi.number().when("card_type_id", { is: null, then: Joi.number().required() }),
      })
      .unknown(true)
  );
  return new Promise((resolve, reject) => {
    const { value, error, warning } = schema.validate(body);
    if (error) {
      reject({ status_code: 400, message: error.details[0].message });
    } else {
      resolve(value);
    }
  });
};

module.exports = {
  checkBankProviderId,
  checkBankAuthCode,
  checkBankId,
  checkAccountId,
  checkCardData,
};
