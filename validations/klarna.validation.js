const Joi = require("joi");
var Promise = require("promise");

// This function is used to validate klarna data.
const checkKlarnaData = function (body) {
  const schema = Joi.object()
    .keys({
      klarna_account_id: Joi.number().optional(),
      price_of_purchase: Joi.number().required(),
      payment_schedule: Joi.string().required(),
      payment_completed: Joi.when("payment_schedule", { is: "Pay in 30 days", then: Joi.required() }),
      date_of_purchase: Joi.string().when("payment_schedule", { is: "Pay in 30 days", then: Joi.string().required() }),
      initial_payment: Joi.object().when("payment_schedule", {
        is: "Pay in 3 installments",
        then: Joi.object()
          .keys({
            platform_card_account_id: Joi.string().required(),
            account_type: Joi.string().required(),
            initial_payment_date: Joi.string().required(),
            initial_payment_price: Joi.required(),
          })
          .required(),
      }),
      installments: Joi.array().when("payment_schedule", {
        is: "Pay in 3 installments",
        then: Joi.array()
          .items(
            Joi.object().keys({
              installment_amount: Joi.required(),
              installments_date: Joi.string().required(),
              completed: Joi.valid(true, false).required(),
            })
          )
          .required(),
      }),
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
// This function is used to validate klarna id and installments data.
const checkKlarnaInstallments = function (body) {
  const schema = Joi.object()
    .keys({
      klarna_id: Joi.number().required(),
      installments: Joi.array()
        .items(
          Joi.object().keys({
            installment_amount: Joi.required(),
            installments_date: Joi.string().required(),
            completed: Joi.valid(true, false).required(),
          })
        )
        .required(),
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
module.exports = {
  checkKlarnaData,
  checkKlarnaInstallments,
};
