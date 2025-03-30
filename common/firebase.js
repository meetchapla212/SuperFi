var admin = require("firebase-admin");
const serviceAccount = require("./../config/superfi-web-firebase-adminsdk-4vhrc-3baf1814f3.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// This function is to send notification.
const sendNotification = function (tokens, messages) {
  const registrationToken = tokens;

  const options = {
    priority: "high",
    timeToLive: 60 * 60 * 24,
  };
  messages.forEach((message) => {
    message.notification = {
      ...message.notification,
      icon: "ic_small_icon",
      sound: "default",
      color: "#112042",
    };
    admin
      .messaging()
      .sendToDevice(registrationToken, message, options)
      .then((response) => {
        console.log("Notification Sent Successfully.");
      })
      .catch((error) => {
        console.log(error);
      });
  });
};

module.exports = {
  sendNotification,
};
