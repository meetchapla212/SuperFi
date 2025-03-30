const Joi = require("joi");
var Promise = require("promise");

// This function is used to validate calculation data.
const checkCalculationData = function (body, method_type) {
  const schema = Joi.object()
    .keys({
      pay_amount: method_type == "avalanche" || method_type == "snowball" ? Joi.number().required() : Joi.optional(),
      original_pay_amount: method_type == "avalanche" || method_type == "snowball" ? Joi.number().greater(0).required() : Joi.optional(),
      cards_accounts: Joi.array().items(
        Joi.object()
          .keys({
            user_card_id: Joi.number().optional(),
            user_overdraft_account_id: Joi.number().optional(),
            klarna_id: Joi.number().optional(),
            platform_card_account_id: Joi.optional(),
            account_type: Joi.string()
              .when("user_card_id", { is: Joi.exist(), then: Joi.string().required() })
              .concat(Joi.string().when("user_overdraft_account_id", { is: Joi.exist(), then: Joi.string().required() })),
            bank_id: Joi.number().optional(),
            card_type_id: Joi.number().optional(),
            display_name: Joi.string()
              .when("user_card_id", { is: Joi.exist(), then: Joi.string().required() })
              .concat(Joi.string().when("user_overdraft_account_id", { is: Joi.exist(), then: Joi.string().required() })),
            provider_id: Joi.string().optional(),
            logo_uri: Joi.string().optional(),
            interest_rate: Joi.optional(),
            updated_interest_rate: Joi.optional(),
            custom_interest_rate: Joi.optional(),
            original_balance: Joi.number()
              .when("user_card_id", { is: Joi.exist(), then: Joi.number().required() })
              .concat(Joi.number().when("user_overdraft_account_id", { is: Joi.exist(), then: Joi.number().required() })),
            current_balance: Joi.number()
              .when("user_card_id", { is: Joi.exist(), then: Joi.number().required() })
              .concat(Joi.number().when("user_overdraft_account_id", { is: Joi.exist(), then: Joi.number().required() })),
            overdraft: Joi.number().optional(),
            minimum_repayment: Joi.number()
              .when("user_card_id", { is: Joi.exist(), then: Joi.number().required() })
              .concat(Joi.number().when("user_overdraft_account_id", { is: Joi.exist(), then: Joi.number().required() })),
          })
          .unknown(true)
          .or("user_card_id", "user_overdraft_account_id", "klarna_id")
          .or("interest_rate", "updated_interest_rate", "custom_interest_rate")
          .required()
      ),
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
// This function is used to validate repayment data.
const checkRepaymentData = function (body) {
  const schema = Joi.object()
    .keys({
      amount: Joi.number().required(),
      platform_card_account_id: Joi.string().optional(),
      user_card_account_id: Joi.number()
        .when("account_type", { is: "credit card", then: Joi.number().required() })
        .concat(Joi.number().when("account_type", { is: "overdraft", then: Joi.number().required() })),
      bnpl_platform_id: Joi.number().when("account_type", { is: "klarna", then: Joi.number().required() }),
      account_type: Joi.string().required(),
      current_balance: Joi.number()
        .when("account_type", { is: "credit card", then: Joi.number().required() })
        .concat(Joi.number().when("account_type", { is: "overdraft", then: Joi.number().required() })),
      minimum_repayment: Joi.number().optional(),
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
// This function is used to validate card and account id.
const checkCardAccountId = function (body) {
  const schema = Joi.object()
    .keys({
      user_card_id: Joi.number(),
      user_overdraft_account_id: Joi.number(),
      klarna_id: Joi.number(),
    })
    .or("user_card_id", "user_overdraft_account_id", "klarna_id")
    .required()
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
// This function is used to validate pay amount data.
const checkPayAmountData = function (body) {
  const schema = Joi.object()
    .keys({
      method_type: Joi.string().valid("avalanche", "snowball").required(),
      pay_amount: Joi.number().required(),
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
// This function is used to validate payment due date.
const checkPaymentDueDateData = function (body) {
  const schema = Joi.object()
    .keys({
      user_card_id: Joi.number().optional(),
      klarna_id: Joi.number().optional(),
      due_date: Joi.string().required(),
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
// This function is used to validate minimum repayment data.
const checkMinimumRepaymentData = function (body) {
  const schema = Joi.object()
    .keys({
      user_card_id: Joi.number().required(),
      minimum_repayment: Joi.number().required(),
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
// This function is used to validate interest rate data.
const checkInterestRateData = function (body) {
  const schema = Joi.object()
    .keys({
      user_card_id: Joi.number(),
      user_overdraft_account_id: Joi.number(),
      interest_rate: Joi.number().required(),
    })
    .or("user_card_id", "user_overdraft_account_id")
    .required()
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
// This function is used to validate email id and type.
const checkEmail = function (body) {
  const schema = Joi.object()
    .keys({
      type: Joi.string().required(),
      email_id: Joi.string().optional(),
    })
    .required()
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
// This function is used to validate user card / overdraft account id.
const checkCardOverdraftId = function (body) {
  const schema = Joi.object()
    .keys({
      user_card_id: Joi.number(),
      user_overdraft_account_id: Joi.number(),
      limit: Joi.number().required(),
    })
    .or("user_card_id", "user_overdraft_account_id")
    .required()
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

const checkCardAccountData = function (body) {
  const schema = Joi.object()
    .keys({
      provider_name: Joi.string().required(),
      current_balance: Joi.number().required(),
      interest_rate: Joi.required(),
      card_number: Joi.when("account_type", { is: "credit card", then: Joi.required() }),
      due_date: Joi.string().when("account_type", { is: "credit card", then: Joi.string().required() }),
      account_number: Joi.number().when("account_type", { is: "debit card", then: Joi.number().required() }),
      sort_code: Joi.string().when("account_type", { is: "debit card", then: Joi.string().required() }),
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
// This function is used to validate Account id.
const checkAccountId = function (body) {
  const schema = Joi.object()
    .keys({
      account_id: Joi.number().required(),
      account_type: Joi.string().required(),
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
// This function is used to validate Account balance.
const checkAccountBalance = function (body) {
  const schema = Joi.object()
    .keys({
      user_card_id: Joi.number(),
      user_overdraft_account_id: Joi.number(),
      balance: Joi.number().required(),
    })
    .or("user_card_id", "user_overdraft_account_id")
    .required()
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
  checkCalculationData,
  checkRepaymentData,
  checkCardAccountId,
  checkPayAmountData,
  checkPaymentDueDateData,
  checkMinimumRepaymentData,
  checkInterestRateData,
  checkEmail,
  checkCardOverdraftId,
  checkCardAccountData,
  checkAccountId,
  checkAccountBalance,
};
