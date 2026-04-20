import userSchema from "../../models/user.js";
import otpSchema from "../../models/otp.js";
import cartSchema from "../../models/cart.js";
import Product from "../../models/product.js";
import Variant from "../../models/variant.js";
import * as userService from "../../services/userServices/userService.js"
import Categories from "../../models/category.js";
import bcrypt from "bcryptjs";
import { sendOtpEmail } from "../../utils/otpController.js";
import generateOtp from "../../utils/otpGenerator.js";
import { generateReferralCode, rewardReferrer } from "../../utils/referralHelper.js";
import Wallet from "../../models/wallet.js";
import WalletTransactions from "../../models/walletTransactions.js";
import Coupon from "../../models/coupon.js";

/* =========================
   LANDING PAGE
========================= */
const landingPage = async (req, res) => {
  try {

    const categories = await Categories.find({});
    const loginSuccess = req.query.loginSuccess === "true";
    const currentUser = req.session.user?._id || null;

    let totalItems = 0; // default value

    if (currentUser) {
      const cart = await cartSchema
        .findOne({ User_id: currentUser })
        .populate("Items.Product_id")
        .populate("Items.Variant_id");

      // check if cart exists
      if (cart && cart.Items) {
        totalItems = cart.Items.length;
      }
    }

    const trendingProducts = await Product.find({ status: { $ne: 'inactive' }, IsDeleted: { $ne: true } }).limit(4);
    const trendingVariants = [];
    for (const p of trendingProducts) {
      const v = await Variant.findOne({ productId: p._id, IsActive: { $ne: false }, IsDeleted: { $ne: true } });
      if (v) trendingVariants.push({ product: p, variant: v });
    }

    // Fetch latest active, non-expired coupon for hero banner
    const latestCoupon = await Coupon.findOne({
      isActive: true,
      isDeleted: { $ne: true },
      validTill: { $gte: new Date() }
    }).sort({ createdAt: -1 });

    res.render("user/home/landingPage", {
      cartItemCount: totalItems,
      categories,
      trendingVariants,
      user: req.session.user || null,
      loginSuccess,
      latestCoupon: latestCoupon || null,
    });

  } catch (error) {
    console.log("Landing Page Error:", error);
    res.status(500).send("Server Error");
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

  // Referral capture via URL query
  if (req.query.ref) {
    req.session.referredByCode = req.query.ref;
  }

  res.render("user/auth/signUpPage", {
    nameError: signupErrors.Name || null,
    emailError: signupErrors.Email || null,
    passError: signupErrors.Password || null,
    phoneError: signupErrors.Phone || null,
    Name: signupData.Name || "",
    Email: signupData.Email || "",
    Phone: signupData.Phone || "",
    Password: signupData.Password || "",
    confirmPassword: signupData.confirmPassword || "",
    referralCode: signupData.referralCode || req.session.referredByCode || "",
    clearLocalStorage: true,
  });
};

const userSignUp = async (req, res) => {
  try {
    const result = await userService.userSignUpService(req.body);

    if (result.error) {
      req.session.signupErrors = result.error;
      req.session.signupData = result.data;
      res.redirect("/signup");
      return;
    }

    req.session.tempUser = result.tempUser;
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

    // Referral logic: form input takes priority over URL query session
    let referredBy = null;
    const enteredCode = req.session.tempUser?.referralCode || req.session.referredByCode || null;
    if (enteredCode) {
      const referrer = await userSchema.findOne({ referralCode: enteredCode });
      if (referrer) {
        referredBy = referrer._id;
      }
    }

    const referralCode = await generateReferralCode();

    const newUser = await userSchema.create({
      Name,
      Email,
      Phone_number: Phone,
      Password,
      isAdmin: false,
      isActive: true,
      createdAt: new Date(),
      referralCode,
      referredBy
    });

    // Create Wallet for new user — starts at ₹0
    const newUserWallet = await Wallet.create({
      user_id: newUser._id,
      balance: 0
    });

    // Reward only the REFERRER (the user whose code was used) with ₹500
    if (referredBy) {
      await rewardReferrer(referredBy, newUser._id);

      const referrerWallet = await Wallet.findOne({ user_id: referredBy });
      if (referrerWallet) {
        referrerWallet.balance += 500;
        await referrerWallet.save();

        await WalletTransactions.create({
          user: referredBy,
          Amount: 500,
          Payment_status: 'credited',
          Wallet_id: referrerWallet._id,
          Payment_date: new Date(),
          Payment_time: new Date(),
          Description: `Referral reward – your friend ${newUser.Name} joined Zyrox`,
        });
      }
    }

    await otpSchema.deleteMany({ Email });
    req.session.lastEmail = Email;
    delete req.session.tempUser;
    delete req.session.referredByCode;

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
  const returnTo = req.session.returnTo || null;
  res.render("user/auth/signInPage", {
    emailError: null,
    passError: null,
    Email: "",
    error: error || null,
    returnTo,
  });
};

const userSignIn = async (req, res) => {
  try {
    const Email = req.body.email || req.body.Email;
    const Password = req.body.password || req.body.Password;
    const trimmedEmail = Email ? Email.trim().toLowerCase() : "";

    const emailRegex = /^[a-zA-Z0-9+._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!emailRegex.test(trimmedEmail)) {
      return res.json({ success: false, target: "email", message: "Invalid email format" });
    }

    if (!Password) {
      return res.json({ success: false, target: "password", message: "Password is required" });
    }

    const user = await userSchema.findOne({ Email: trimmedEmail, isAdmin: false });

    if (!user)
      return res.json({ success: false, target: "email", message: "User not found" });

    if (!user.isActive)
      return res.json({ success: false, blocked: true, message: "Your account has been Deactivated by admin" });

    if (!user.Password)
      return res.json({ success: false, target: "email", message: "This account was created using Google. Please sign in with Google." });

    const isMatch = await bcrypt.compare(Password, user.Password);

    if (!isMatch)
      return res.json({ success: false, target: "password", message: "Incorrect Password" });

    const adminSession = req.session.admin;
    const returnTo = req.session.returnTo || '/';

    
    req.session.regenerate((err) => {
      if (err) return res.json({ success: false, message: "Session error" });

      if (adminSession) {
        req.session.admin = adminSession;
      }

      req.session.user = {
        _id: user._id,
        Name: user.Name,
        Email: user.Email,
      };

      req.session.save((err) => {
        if (err) return res.json({ success: false, message: "Session save error" });
        res.json({ success: true, message: "Login Successful", returnTo });
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
  if (req.session.user) {
    delete req.session.user;
  }
  if (req.session.passport) {
    delete req.session.passport;
  }
  res.redirect("/");
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

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!Password || !passwordRegex.test(Password)) {
      req.session.passError = "Password must be at least 8 characters and contain at least one letter and one number";
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