require('dotenv').config();
const nodemailer = require('nodemailer'); // For sending emails (npm install nodemailer)
const password = process.env.Password; // Get password from environment variable
const email = process.env.email; 






const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: email,       // your Gmail address
    pass: password,          // 16-digit app password from Google
  },
});

module.exports = transporter; // Export the transporter for use in other files

