const jwt = require("jsonwebtoken");
const moment = require("moment");
const nodemailer = require("nodemailer");
const dateFormat = "YYYY-MM-DD HH:mm:ss";
const bucketName = process.env.BUCKET_NAME;
const REGION = process.env.AWSREGION;
const https = require("https");
var crypto = require("crypto");
var config = require("./../config/config");
const algorithm = "aes-256-cbc"; //Using AES encryption
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

// This function is used to get current date.
const getCurrentDate = () => {
  var date = moment.utc().format(dateFormat);
  return date;
};
// This function is used to create aws s3 file url.
const getS3FileUrl = (fileName) => {
  var url = `https://${bucketName}.s3-${REGION}.amazonaws.com/${fileName}?ver=${moment.now()}`;
  return url;
};

// This function is used to create user jwt token.
const createJWT = (parsedBody, timeExp = config.JWT_EXPIRATION) => {
  return jwt.sign(parsedBody, config.SECRET, {
    expiresIn: timeExp,
  });
};

// This function is used to create admin jwt token.
const createAdminJWT = (parsedBody, timeExp = config.JWT_EXPIRATION) => {
  return jwt.sign(parsedBody, config.ADMIN_SECRET, {
    expiresIn: timeExp,
  });
};

// This function is used to verify user jwt token.
const verifyJWT = (token) => {
  return jwt.verify(token, config.SECRET);
};

// This function is used to verify admin jwt token.
const verifyAdminJWT = (token) => {
  return jwt.verify(token, config.ADMIN_SECRET);
};
// This function is used to verify user and returns user id.
const verifyUser = function (authHeader) {
  return new Promise((resolve, reject) => {
    try {
      const token = authHeader && authHeader.split(" ")[1];
      if (token == null) throw Error("Invalid Token");
      let decoded = verifyJWT(token);
      let user = decoded;
      if (user && user.userId) {
        resolve(user);
      }
    } catch (err) {
      reject({ status_code: 400, message: "Unauthorized Token" });
    }
  });
};
// This function is used to decode jwt token.
const decodeToken = function (token) {
  return new Promise((resolve, reject) => {
    try {
      let decoded = verifyJWT(token);
      if (decoded) {
        resolve({ status: true, data: decoded });
      }
    } catch (err) {
      resolve({ status: false, message: "Unauthorized Token" });
    }
  });
};
// This function is used to send email.
const sendEmail = async function (to, subject, text, html) {
  return new Promise((resolve, reject) => {
    let transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: true,
      auth: {
        user: config.SMTP_USERNAME,
        pass: config.SMTP_PASSWORD,
      },
      priority: "high",
    });
    transporter.sendMail(
      {
        from: `${config.SMTP_SENDER_EMAIL}`,
        to: to,
        subject: subject,
        text: text,
        html: html,
      },
      function (err, info) {
        if (err) {
          console.log("Email error: " + err.message);
          reject(err);
        } else {
          //console.log("Email sent: " + info.response);
          resolve(info);
        }
      }
    );
  });
};
// This function is used to verify admin jwt token and returns admin id.
const verifyAdmin = function (authHeader) {
  return new Promise((resolve, reject) => {
    try {
      const token = authHeader && authHeader.split(" ")[1];
      if (token == null) throw Error("Invalid Admin access");
      let decoded = verifyAdminJWT(token);
      let admin = decoded;
      if (admin && admin.adminId) {
        resolve(admin);
      }
    } catch (err) {
      reject({
        status_code: 400,
        message: "Unauthorized Admin access",
      });
    }
  });
};
// This function is used to replace url with html strings.
const escapeHTML = (str) =>
  str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      }[tag])
  );
// This function is used to replace url with strings.
const escapeUrl = function (str) {
  return (
    str
      .replace(/%40/gi, "@")
      .replace(/%3A/gi, ":")
      .replace(/%24/g, "$")
      .replace(/%2C/gi, ",")
      // replace(/%20/g, '+').
      .replace(/%5B/gi, "[")
      .replace(/%5D/gi, "]")
  );
};
// This function is used to replace strings.
const escapeString = function (val) {
  val = val.replace(/[\0\n\r\b\t\\'"\x1a]/g, function (s) {
    switch (s) {
      case "\0":
        return "\\0";
      case "\r":
        return "\\r";
      case "\b":
        return "\\b";
      case "\t":
        return "\\t";
      case "\x1a":
        return "\\Z";
      case "'":
        return "''";
      case '"':
        return '""';
      default:
        return "\\" + s;
    }
  });

  return val;
};
// This function is used to trim json objects.
const trimObj = (obj) => {
  if (!Array.isArray(obj) && typeof obj != "object") return obj;
  return Object.keys(obj).reduce(
    function (acc, key) {
      acc[key] = typeof obj[key] == "string" ? obj[key].trim() : trimObj(obj[key]);
      return acc;
    },
    Array.isArray(obj) ? [] : {}
  );
};
// This function is used to check json string.
const IsJsonString = (str) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};
// This function is used to call url.
const fetch = async (url) => {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 1000 }, (res) => {
      if (res.statusCode < 200 || res.statusCode > 299) {
        return reject(new Error(`HTTP status code ${res.statusCode}`));
      }

      const body = [];
      res.on("data", (chunk) => body.push(chunk));
      res.on("end", () => {
        const resString = Buffer.concat(body).toString();
        if (IsJsonString(resString)) {
          resolve(JSON.parse(resString));
        } else resolve(resString);
      });
    });

    request.on("error", (err) => {
      reject(err);
    });
    request.on("timeout", () => {
      request.destroy();
      reject(new Error("timed out"));
    });
  });
};
// This function is used to create hashed password with sha256 algorithm.
const createHex = (value) => {
  return crypto.createHmac("sha256", config.SECRET).update(value).digest("hex");
};
// This function is used to create generate random string.
const generateRandomString = (length = 6) => {
  return crypto
    .randomBytes(30)
    .toString("hex")
    .substring(2, length + 2);
};
// This function is used to create generate random number.
const generateRandomNumber = (length = 6) => {
  return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1));
};
// This function is used to create superfi default minimum repayment.
const createMinimumRepayment = (balance, interest_rate) => {
  if (balance && interest_rate) {
    const interest = +(balance * (interest_rate / 100 / 12)).toFixed(2);
    const minMonthly = +(0.01 * balance).toFixed(2) + interest;

    if (balance < 25) return balance;
    if (minMonthly < 25) return 25;
    return minMonthly;
  } else {
    return 0;
  }
};
// This function is used to format amount with currency.
const formatAmountWithCurrency = (amount, currency, minimumFractionDigits = 2) => {
  let formatDecimal = parseFloat(amount).toString();
  let price = parseFloat(formatDecimal).toLocaleString("en-US", {
    style: "currency",
    currency: currency ? currency : "GBP",
    useGrouping: true,
    maximumFractionDigits: 2,
    minimumFractionDigits: minimumFractionDigits,
  });
  return price;
};
// This function is used to format amount with decimals.
const formatAmount = (number, decimals = 2) => {
  return Number(number).toFixed(decimals);
};

const encryptData = (text) => {
  text = JSON.stringify(text);
  let cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(config.ENCRYPT_SECRET_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  console.log(JSON.stringify({ iv: iv.toString("hex"), encryptedData: encrypted.toString("hex") }));
  return JSON.stringify({ iv: iv.toString("hex"), encryptedData: encrypted.toString("hex") });
};

const decryptData = (text) => {
  let iv = Buffer.from(text.iv, "hex");
  let encryptedText = Buffer.from(text.encryptedData, "hex");
  let decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(config.ENCRYPT_SECRET_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  console.log(decrypted.toString());
  return JSON.parse(decrypted.toString());
};

module.exports = {
  getCurrentDate,
  decodeToken,
  verifyUser,
  verifyAdmin,
  verifyJWT,
  verifyAdminJWT,
  createJWT,
  createAdminJWT,
  getS3FileUrl,
  sendEmail,
  escapeHTML,
  escapeString,
  trimObj,
  IsJsonString,
  fetch,
  createHex,
  generateRandomNumber,
  generateRandomString,
  createMinimumRepayment,
  escapeUrl,
  formatAmountWithCurrency,
  formatAmount,
  encryptData,
  decryptData,
};
