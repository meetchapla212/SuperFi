var apiRoute = require("./api.routes");
var cors = require("cors");

module.exports = function (app) {
  app.use(cors());
  app.use(function (req, res, next) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS, PUT, PATCH, DELETE"
    );
    res.setHeader("Access-Control-Allow-Credentials", true);
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept,x-access-token,access-control-allow-origin"
    );
    next();
  });

  // localhost:port/api/
  app.use("/api", apiRoute);
};
