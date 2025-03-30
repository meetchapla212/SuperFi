const successMessages = {
  USER_ADDED_SUCCESS: "Success! User Added Successfully!",
  LOGIN_SUCCESS: "User Login Successfully!",
  NEW_EMAIL_ID: "New Email Id!",
  ADMIN_SIGNUP_OPEN_SETTING: "Admin Signup Open Setting.",
  EMAIL_DATA_ADDED_SUCCESS: "Email Data Added.",
  MAIL_SENT_TO_VERIFY_EMAIL: "Check Your Inbox To Verify Your Email Id.",
  EMAIL_VERIFY_TOKEN_UPDATE_SUCCESS: "Email Verify Token Update Successfully!",
  EMAIL_VERIFIED_SUCCESS: "Email Verified Successfully!",
  BANK_LIST_SUCCESS: "Bank Listed Successfully!",
  GENERATE_AUTH_LINK_SUCCESS: "Auth Link Generated Successfully!",
  GENERATE_ACCESS_REFRESH_TOKEN: "Access and Refresh Token Generated Successfully!"

};

const errorMessages = {
  USER_INVALID_DATA: "Error! Invalid Data Found.",
  ACCOUNT_NOT_FOUND: "Account Not Found!",
  INVALID_PASSCODE: "Invalid Passcode!",
  ADMIN_PAUSED_USER: "Admin Paused User From Login.",
  EMAIL_ID_ALREADY_EXIST: "Email Id Already Linked To An Account!",
  ADMIN_SIGNUP_OPEN_SETTING_NOT_FOUND: "Admin Signup Open Setting Not Found.",
  TOKEN_NOT_PROVIDED: "No Token Provided.",
  AUTHENTICATION_FAILED: "Failed To Authenticate Token.",
  API_KEY_NOT_PROVIDED: "No API Key Provided.",
  PROVIDE_CORRECT_API: "No Authentication, Provide Correct Api Key.",
  USER_PAUSED: "Admin Paused User From Access.",
  ADMIN_SIGNUP_NOT_OPEN: "Admin Signup Not Open.",
  EMAIL_ID_ALREADY_VERIFIED: "Email Id Already Verified.",
  SOMETHING_WENT_WRONG: "Something went wrong! Please try again!",
  EMAIL_VERIFICATION_LINK_NOT_VALID: "Email Verification Link Not Valid!",
  BANK_ID_NOT_FOUND: "Bank Id Not Found.",
  PROVIDER_ID_NOT_FOUND: "Provider Id Not Found.",
  TOKEN_NOT_FOUND: "Token Not Found.",
};

const EMAIL_SUBJECTS = {
  EMAIL_VERIFICATION: {
    subject: "SuperFi: Verify your email to log in",
    text: "Please verify your email to log in",
  },
  EMAIL_FORGOT_PASSCODE: {
    subject: "SuperFi: New Passcode Request",
    text: "You received this email because you requested to reset your passcode",
  },
  ADMIN_EMAIL_FORGOT_PASSCODE: {
    subject: "SuperFi Admin: New Passcode Request",
    text: "You received this email because you requested to reset your passcode",
  },
  WELCOME_EMAIL: {
    subject: "Welcome Email",
    text: "Welcome Mail",
  },
};

const DEFAULT_EMAIL_LINKS = {
  LOGO_IMAGE_URL: "https://i.ibb.co/KFXMtLh/Logo.png",
  GOOGLE_PLAY_STORE_IMAGE_URL:
    "https://i.ibb.co/LCF6qYJ/Google-Play-button.png",
  APPLE_STORE_IMAGE_URL: "https://i.ibb.co/L0R7L8Z/app-store-button.png",
  APP_URL: "#",
  PLAY_STORE_LINK: "",
  APP_STORE_LINK: "#",
  CONTACT_US: "mailto:support@joinsuperfi.com",
  PRIVACY_POLICY: "https://www.joinsuperfi.com/privacy-policy/",
  COPYRIGHT_YEAR: "2022",
};

module.exports = {
  successMessages,
  errorMessages,
  EMAIL_SUBJECTS,
  DEFAULT_EMAIL_LINKS,
};
