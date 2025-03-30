const Joi = require("joi");
var Promise = require("promise");

// This function is used to validate email id and progress data.
const checkOnboardingProgress = function (body) {
  const schema = Joi.object()
    .keys({
      email_id: Joi.string().email().required(),
      progress: Joi.object().required(),
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
// This function is used to validate email id.
const checkOnboardingEmail = function (body) {
  const schema = Joi.object()
    .keys({
      email_id: Joi.string().email().required(),
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
// This function is used to validate email id and device name.
const checkUserEmail = function (body) {
  const schema = Joi.object()
    .keys({
      email_id: Joi.string().email().required(),
      device_name: Joi.string().valid("android", "ios").optional(),
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
// This function is used to validate register data.
const checkRegisterUser = function (body) {
  const schema = Joi.object()
    .keys({
      email_id: Joi.string().email().required(),
      passcode: Joi.string().length(4).required(),
      first_name: Joi.required(),
      surname: Joi.required(),
      date_of_birth: Joi.date().required(),
      device_name: Joi.string().valid("android", "ios").optional(),
      device_id: Joi.string().optional(),
      device_token: Joi.string().optional(),
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
// This function is used to validate login data.
const checkLogin = function (body) {
  const schema = Joi.object()
    .keys({
      email_id: Joi.string().email().required(),
      passcode: Joi.string().length(4).required(),
      device_name: Joi.string().valid("android", "ios").optional(),
      device_id: Joi.string().optional(),
      device_token: Joi.string().optional(),
    })
    .unknown(false);
  return new Promise((resolve, reject) => {
    const { value, error, warning } = schema.validate(body);
    if (error) {
      reject({ status_code: 400, message: error.details[0].message });
    } else {
      resolve(value);
    }
  });
};
// This function is used to validate device data.
const checkPushToken = function (body) {
  const schema = Joi.object()
    .keys({
      device_id: Joi.string().required(),
      device_type: Joi.string().valid("android", "ios").required(),
      device_token: Joi.string().required(),
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
// This function is used to validate passcode.
const checkPasscode = function (body) {
  const schema = Joi.object()
    .keys({
      passcode: Joi.string().length(4).required(),
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
// This function is used to validate superfi rating.
const checkSuperfiRating = function (body) {
  const schema = Joi.object()
    .keys({
      superfi_rating: Joi.number().valid(0, 1).required(),
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
// This function is used to validate user preference data.
const checkUserPreference = function (body) {
  const schema = Joi.object()
    .keys({
      marketing_preferences: Joi.number().valid(0, 1).optional(),
      push_notification_preferences: Joi.number().valid(0, 1).optional(),
      biometrics_preferences: Joi.number().valid(0, 1).optional(),
      round_up_preferences: Joi.number().valid(0, 1).optional(),
      device_id: Joi.string().when("push_notification_preferences", { is: 1, then: Joi.string().required() }),
      device_token: Joi.string().when("push_notification_preferences", { is: 1, then: Joi.string().required() }),
      device_name: Joi.string().valid("android", "ios").optional(),
    })
    .or("marketing_preferences", "push_notification_preferences", "biometrics_preferences", "round_up_preferences")
    .required();
  return new Promise((resolve, reject) => {
    const { value, error, warning } = schema.validate(body);
    if (error) {
      reject({ status_code: 400, message: error.details[0].message });
    } else {
      resolve(value);
    }
  });
};
// This function is used to validate device id.
const checkLogout = function (body) {
  const schema = Joi.object()
    .keys({
      device_id: Joi.string().required(),
    })
    .unknown(false);
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
  checkUserEmail,
  checkRegisterUser,
  checkLogin,
  checkPushToken,
  checkOnboardingProgress,
  checkPasscode,
  checkSuperfiRating,
  checkUserPreference,
  checkOnboardingEmail,
  checkLogout,
};
