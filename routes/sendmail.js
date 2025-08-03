const expresss = require('express'); // Express framework for building web applications
const router = expresss.Router(); // Create a new router instance
 // For sending emails
const transporter = require('../utils/transporter'); // Import the transporter for sending emails
require('dotenv').config(); // Load environment variables from .env file
// Route to handle sending emails
const email = process.env.email; // Get email from environment variable

router.post("/", (req, res) => {
    // Extract data from request body
    const { name, email: senderEmail, subject, message } = req.body; 
    
    // Compose the email content
    const mailOptions = {
      from: email, // Use the email from environment variable
      to: email, // Send to the same email address
      subject: `Contact Form: ${subject}`,
      text: `
        Name: ${name}
        Email: ${senderEmail}
        Subject: ${subject}
        Message: ${message}
      `,
    };      
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error:", error);
        return res.status(500).send("Error sending email");
      }
      res.status(200).send("Email sent successfully");
    });
});

module.exports = router; // Export the router for use in other files