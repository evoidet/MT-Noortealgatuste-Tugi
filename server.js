const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", function (req, res) {
  res.send("Server töötab");
});

app.post("/api/contact", async function (req, res) {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({
      success: false,
      message: "Palun täitke kõik kohustuslikud väljad."
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: process.env.MAIL_TO,
      replyTo: email,
      subject: `Kontaktivorm: ${subject}`,
      text: `
Nimi: ${name}
E-post: ${email}
Telefon: ${phone || "Puudub"}

Sõnum:
${message}
      `
    });

    res.json({
      success: true,
      message: "Sõnum saadetud."
    });
  } catch (error) {
    console.error("Mail error:", error);

    res.status(500).json({
      success: false,
      message: "Sõnumi saatmine ebaõnnestus."
    });
  }
});

app.listen(PORT, function () {
  console.log(`Server töötab pordil ${PORT}`);
});