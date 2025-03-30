// Dependencies
const config = require("./config");
const routes = require("./../routes/routes");
const express = require("express");
const Sentry = require("@sentry/node");
// or use es6 import statements

const initApp = function () {
  // Init
  let app = express();
  app.engine("html", require("ejs").renderFile);
  app.set("view engine", "html");
  app.use(express.static(__dirname + "./../uploads"));

  const Tracing = require("@sentry/tracing");
  // or use es6 import statements
  // import * as Tracing from '@sentry/tracing';

  Sentry.init({
    dsn: "https://28d1bfa0d26843849e12199d9f995696@o1188420.ingest.sentry.io/6308465",

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
  });
  // Config
  app.set("port", config.PORT);

  // for parsing application/x-www-form-urlencoded
  app.use(
    express.urlencoded({
      extended: true,
    })
  );

  // for parsing application/json
  app.use(express.json());

  // for parsing multipart/form-data

  // Setup routes
  routes(app);

  return app;
};

module.exports = initApp;
