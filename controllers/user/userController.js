import userSchema from "../../models/user.js";
import otpSchema from "../../models/otp.js";
import Categories from "../../models/category.js";
import bcrypt from "bcryptjs";
import { sendOtpEmail } from "../../utils/otpController.js";
import generateOtp from "../../utils/otpGenerator.js";

/* =========================
   LANDING PAGE
========================= */
const landingPage = async (req, res) => {
  try{
   const categories = await Categories.find({})
    const loginSuccess = req.query.loginSuccess === "true";
    res.render("user/home/landingPage", {
      cartItemCount: "12",
      categories,
      user: req.session.user || null,
      loginSuccess,
    });
  }catch(error){

  }
};

/* =========================
   SIGN UP
========================= */
const loadSignUp = (req, res) => {
  const signupErrors = req.session.signupErrors || {};
  const signupData = req.session.signupData || {};

  delete req.session.signupErrors;
  delete req.session.signupData;

  res.render("user/auth/signUpPage", {
    emailError: signupErrors.Email || null,
    passError: signupErrors.Password || null,
    phoneError: signupErrors.Phone || null,

    Name: signupData.Name || "",
    Email: signupData.Email || "",
    Phone: signupData.Phone || "",
    Password: signupData.Password || "",
    confirmPassword: signupData.confirmPassword || "",
    clearLocalStorage: true,
  });
};

const userSignUp = async (req, res) => {
  try {
    const { Name, Email, Phone, Password, confirmPassword } = req.body;

    const trimmedName = Name ? Name.trim() : "";
    const trimmedEmail = Email ? Email.trim().toLowerCase() : "";
    const trimmedPhone = Phone ? Phone.trim() : "";
    const trimmedPassword = Password ? Password.trim() : "";

    const emailRegex = /^[a-zA-Z0-9+._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const indianPhone = /^(?:\+91|91|0)?[6-9]\d{9}$/;

    if (!emailRegex.test(trimmedEmail)) {
      req.session.signupErrors = { Email: "Invalid email format" };
      req.session.signupData = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone };
      return res.redirect("/signup");
    }

    if (!indianPhone.test(trimmedPhone)) {
      req.session.signupErrors = { Phone: "Enter a valid 10-digit indian phone number" };
      req.session.signupData = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone };
      return res.redirect("/signup");
    }

    if (trimmedPassword !== confirmPassword) {
      req.session.signupErrors = { Password: "Passwords do not match" };
      req.session.signupData = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone };
      return res.redirect("/signup");
    }

    const existingUser = await userSchema.findOne({ Email: trimmedEmail });

    if (existingUser) {
      req.session.signupErrors = { Email: "User with this email already exists" };
      req.session.signupData = { Name: trimmedName, Email: trimmedEmail, Phone: trimmedPhone };
      return res.redirect("/signup");
    }

    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);

    req.session.tempUser = {
      Name: trimmedName,
      Email: trimmedEmail,
      Phone: trimmedPhone,
      Password: hashedPassword,
    };

    const { OTP, hashedOtp } = await generateOtp();

    await otpSchema.deleteMany({ Email: trimmedEmail });
    
    await otpSchema.create({
      Email: trimmedEmail,
      Code: hashedOtp,
      ExpiresAt: new Date(Date.now() + 3 * 60 * 1000),
    });

    await sendOtpEmail(trimmedEmail, OTP);

    res.redirect("/otp-verification");
  } catch (error) {
    console.log("Signup Error:", error);
    res.status(500).send("Server Error");
  }
};

/* =========================
   LOAD OTP PAGE
========================= */
const loadOtpPage = (req, res) => {
  const Email =
    req.session.tempUser?.Email ||
    req.session.resetEmail ||
    req.session.editEmail ||
    req.session.lastEmail;

  if (!Email && !req.session.otpSuccess) {
    return res.redirect("/signup");
  }

  let purpose = "signup";
  if (req.session.editEmail) purpose = "edit-email";
  else if (req.session.resetEmail) purpose = "reset";

  const otpError = req.session.otpError || "";
  const otpSuccess = req.session.otpSuccess || "";
  const otpSwal = !!req.session.otpSwal;

  delete req.session.otpError;
  delete req.session.otpSuccess;
  delete req.session.otpSwal;
  if (otpSuccess) delete req.session.lastEmail;

  res.render("user/auth/otpPage", {
    Email: Email || "",
    purpose,
    otpError,
    otpSuccess,
    otpSwal,
  });
};

/* =========================
   VERIFY SIGNUP OTP
========================= */
const verifyEmail = async (req, res) => {
  try {
    if (!req.session.tempUser) return res.redirect("/signup");

    const { A, B, C, D, E, F } = req.body;

    if (!A || !B || !C || !D || !E || !F) {
      req.session.otpError = "Please enter complete OTP";
      return res.redirect("/otp-verification");
    }

    const otp = A + B + C + D + E + F;
    const { Name, Email, Phone, Password } = req.session.tempUser;

    const validOTP = await otpSchema.findOne({ Email });

    if (!validOTP || validOTP.ExpiresAt < new Date()) {
      req.session.otpError = "Invalid or Expired OTP";
      return res.redirect("/otp-verification");
    }

    const isMatch = await bcrypt.compare(otp, validOTP.Code);

    if (!isMatch) {
      req.session.otpError = "Incorrect OTP";
      return res.redirect("/otp-verification");
    }

    const newUser = await userSchema.create({
      Name,
      Email,
      Phone_number: Phone,
      Password,
      isAdmin: false,
      isActive: true,
      createdAt: new Date(),
    });

    await otpSchema.deleteMany({ Email });
    req.session.lastEmail = Email;
    delete req.session.tempUser;

    req.session.user = {
      _id: newUser._id,
      Name: newUser.Name,
      Email: newUser.Email,
      isAdmin: newUser.isAdmin,
    };

    req.session.otpSuccess = "Registration Successful! Welcome to Zyrox.";
    req.session.otpSwal = true;

    res.redirect("/otp-verification");
  } catch (error) {
    console.log("Verify OTP Error:", error);
    res.status(500).send("Server Error");
  }
};

/* =========================
   RESEND OTP
========================= */
const resendOtp = async (req, res) => {
  try {
    const Email =
      req.session.tempUser?.Email ||
      req.session.resetEmail ||
      req.session.editEmail;

    if (!Email) return res.redirect("/");

    const { OTP, hashedOtp } = await generateOtp();

    await otpSchema.deleteMany({ Email });
    await otpSchema.create({
      Email,
      Code: hashedOtp,
      ExpiresAt: new Date(Date.now() + 3 * 60 * 1000),
    });

    await sendOtpEmail(Email, OTP);

    req.session.otpSuccess = "OTP resent successfully";
    res.redirect("/otp-verification");
  } catch (error) {
    console.log("Resend OTP Error:", error);
    res.status(500).send("Server Error");
  }
};

/* =========================
   SIGN IN
========================= */
const loadSignIn = (req, res) => {
  const { error } = req.query;
  res.render("user/auth/signInPage", {
    emailError: null,
    passError: null,
    Email: "",
    error: error || null,
  });
};

const userSignIn = async (req, res) => {
  try {
    const { Email, Password } = req.body;
    const trimmedEmail = Email ? Email.trim().toLowerCase() : "";

    const emailRegex = /^[a-zA-Z0-9+._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!emailRegex.test(trimmedEmail)) {
      return res.json({ success: false, target: "email", message: "Invalid email format" });
    }

    const user = await userSchema.findOne({ Email: trimmedEmail, isAdmin: false });

    if (!user)
      return res.json({ success: false, target: "email", message: "User not found" });

    if (!user.isActive)
      return res.json({ success: false, blocked: true, message: "Your account has been blocked by admin" });

    if (!user.Password)
      return res.json({ success: false, target: "email", message: "This account was created using Google. Please sign in with Google." });

    const isMatch = await bcrypt.compare(Password, user.Password);

    if (!isMatch)
      return res.json({ success: false, target: "password", message: "Incorrect Password" });

    req.session.regenerate((err) => {
      if (err) return res.json({ success: false, message: "Session error" });

      req.session.user = {
        _id: user._id,
        Name: user.Name,
        Email: user.Email,
      };

      req.session.save((err) => {
        if (err) return res.json({ success: false, message: "Session save error" });
        res.json({ success: true, message: "Login Successful" });
      });
    });
  } catch (error) {
    console.log("Signin Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* =========================
   LOGOUT
========================= */
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.redirect("/");
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
};

/* =========================
   FORGOT PASSWORD
========================= */
const loadForgotPassword = (req, res) => {
  const emailError = req.session.emailError || null;
  delete req.session.emailError;

  res.render("user/auth/forgotPassword", {
    emailError,
    clearLocalStorage: true,
  });
};

const sendResetOtp = async (req, res) => {
  try {
    const trimmedEmail = req.body.Email?.trim().toLowerCase();

    const emailRegex = /^[a-zA-Z0-9+._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!emailRegex.test(trimmedEmail)) {
      req.session.emailError = "Invalid email format";
      return res.redirect("/forgot-password");
    }

    const user = await userSchema.findOne({ Email: trimmedEmail });

    if (!user) {
      req.session.emailError = "User with this email does not exist";
      return res.redirect("/forgot-password");
    }

    const { OTP, hashedOtp } = await generateOtp();

    await otpSchema.deleteMany({ Email: trimmedEmail });
    await otpSchema.create({
      Email: trimmedEmail,
      Code: hashedOtp,
      ExpiresAt: new Date(Date.now() + 3 * 60 * 1000),
    });

    await sendOtpEmail(trimmedEmail, OTP);

    req.session.resetEmail = trimmedEmail;
    res.redirect("/otp-verification");
  } catch (error) {
    console.log("Send Reset OTP Error:", error);
    res.status(500).send("Server Error");
  }
};

const verifyResetOtp = async (req, res) => {
  try {
    const { A, B, C, D, E, F } = req.body;
    const Email = req.session.resetEmail;

    if (!Email) return res.redirect("/forgot-password");

    if (!A || !B || !C || !D || !E || !F) {
      req.session.otpError = "Please enter complete OTP";
      return res.redirect("/otp-verification");
    }

    const otp = A + B + C + D + E + F;
    const validOTP = await otpSchema.findOne({ Email });

    if (!validOTP || validOTP.ExpiresAt < new Date()) {
      req.session.otpError = "Invalid or Expired OTP";
      return res.redirect("/otp-verification");
    }

    const isMatch = await bcrypt.compare(otp, validOTP.Code);

    if (!isMatch) {
      req.session.otpError = "Incorrect OTP";
      return res.redirect("/otp-verification");
    }

    await otpSchema.deleteMany({ Email });
    req.session.isOtpVerified = true;
    req.session.otpSuccess = "OTP Verified Successfully";
    req.session.otpSwal = true;

    res.redirect("/otp-verification");
  } catch (error) {
    console.log("Verify Reset OTP Error:", error);
    res.status(500).send("Server Error");
  }
};

/* =========================
   RESET PASSWORD
========================= */
const loadNewPassword = (req, res) => {
  if (!req.session.isOtpVerified) return res.redirect("/forgot-password");

  const passError = req.session.passError || null;
  const passSwal = !!req.session.passSwal;

  delete req.session.passError;
  delete req.session.passSwal;

  res.render("user/auth/resetPassword", { passError, passSwal });
};

const resetPassword = async (req, res) => {
  try {
    const { Password, confirmPassword } = req.body;
    const Email = req.session.resetEmail;

    if (!req.session.isOtpVerified || !Email)
      return res.redirect("/forgot-password");

    if (Password !== confirmPassword) {
      req.session.passError = "Passwords do not match";
      return res.redirect("/new-password");
    }

    const hashedPassword = await bcrypt.hash(Password.trim(), 10);

    await userSchema.updateOne({ Email }, { $set: { Password: hashedPassword } });

    delete req.session.resetEmail;
    delete req.session.isOtpVerified;

    req.session.passSwal = true;
    res.redirect("/new-password");
  } catch (error) {
    console.log("Reset Password Error:", error);
    res.status(500).send("Server Error");
  }
};

export {
  landingPage,
  loadSignUp,
  userSignUp,
  verifyEmail,
  resendOtp,
  loadSignIn,
  userSignIn,
  logout,
  loadForgotPassword,
  sendResetOtp,
  verifyResetOtp,
  loadOtpPage,
  loadNewPassword,
  resetPassword,
};