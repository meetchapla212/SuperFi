const Joi = require("joi");
var Promise = require("promise");

// This function is used to validate reward task name.
const checkRewardName = function (body) {
  const schema = Joi.object()
    .keys({
      reward_task_name: Joi.string().required(),
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
// This function is used to validate overdraft account id.
const checkOverdraftAccountId = function (body) {
  const schema = Joi.object()
    .keys({
      user_overdraft_account_id: Joi.number().required(),
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
  checkRewardName,
  checkOverdraftAccountId,
};
