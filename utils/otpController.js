import nodemailer from "nodemailer";

const sendOtpEmail = async (email, OTP) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL,
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
    console.log(`OTP sent successfully to ${email}`)
  } catch (error) {
    console.log("failed to send otp");
    console.error(error.message);
  }
};

export { sendOtpEmail };
