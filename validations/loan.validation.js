const Joi = require("joi");
var Promise = require("promise");

const checkBankProviderId = function (body) {
    const schema = Joi.object()
        .keys({
            provider_id: Joi.required(),
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
    checkBankProviderId
};