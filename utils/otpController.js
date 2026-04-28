import nodemailer from "nodemailer";

const sendOtpEmail = async (email, OTP) => {
  // Gmail App Passwords are sometimes stored with spaces (e.g. "xxxx xxxx xxxx xxxx")
  // Strip all spaces before passing to nodemailer
  const appPassword = (process.env.PASS || "").replace(/\s+/g, "");

  // Use explicit SMTP settings instead of `service: 'gmail'`
  // (nodemailer v8 dropped many service shortcuts)
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // SSL
    auth: {
      user: process.env.EMAIL,
      pass: appPassword,
    },
  });

  await transporter.sendMail({
    from: `"Zyrox" <${process.env.EMAIL}>`,
    to: email,
    subject: "Email Verification OTP From Zyrox",
    html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="margin-bottom: 10px;">Zyrox Email Verification</h2>

      <p>Hello,</p>

      <p>Your One-Time Password (OTP) is:</p>

      <h1 style="color: #2c3e50; letter-spacing: 5px;">
        ${OTP}
      </h1>

      <p>This OTP is valid for <b>5 minutes</b>.</p>

      <p style="color: red;"><b>Please do not share this code with anyone.</b></p>

      <p>Thank you,<br/>Zyrox Team</p>
    </div>
  `,
  });

  console.log(`✅ OTP sent successfully to ${email}`);
};

export { sendOtpEmail };
