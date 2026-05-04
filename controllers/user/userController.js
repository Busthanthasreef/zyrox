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
const landingPage = async (req, res, next) => {
  try {

    const categories = await Categories.find({ IsActive: true, IsDeleted: false });
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

    // Fetch all active variants for "All Products" section
    const allProducts = await Product.find({ status: { $ne: 'inactive' }, IsDeleted: { $ne: true } });
    const allVariants = [];
    for (const p of allProducts) {
      const v = await Variant.findOne({ productId: p._id, IsActive: { $ne: false }, IsDeleted: { $ne: true }, IsDefault: true })
        || await Variant.findOne({ productId: p._id, IsActive: { $ne: false }, IsDeleted: { $ne: true } });
      if (v) allVariants.push({ product: p, variant: v });
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
      allVariants, // Added allVariants
      user: req.session.user || null,
      loginSuccess,
      latestCoupon: latestCoupon || null,
    });

  } catch (error) {
    next(error);
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
    referralError: signupErrors.referralError || null,
    Name: signupData.Name || "",
    Email: signupData.Email || "",
    Phone: signupData.Phone || "",
    Password: signupData.Password || "",
    confirmPassword: signupData.confirmPassword || "",
    referralCode: signupData.referralCode || req.session.referredByCode || "",
    clearLocalStorage: true,
  });
};

const userSignUp = async (req, res, next) => {
  try {
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('json');

    const result = await userService.userSignUpService(req.body);

    if (result.error) {
      if (isAjax) {
        return res.json({ success: false, errors: result.error });
      } else {
        req.session.signupErrors = result.error;
        req.session.signupData = result.data;
        return res.redirect("/signup");
      }
    }

    // Success - moving to OTP
    req.session.signupData = {
      Name: req.body.name || req.body.Name,
      Email: req.body.email || req.body.Email,
      Phone: req.body.phone || req.body.Phone,
      Password: req.body.password || req.body.Password,
      confirmPassword: req.body.confirmPassword,
      referralCode: req.body.referralCode
    };

    req.session.tempUser = result.tempUser;
    req.session.otpSuccess = "OTP sent to your email";

    if (isAjax) {
      return res.json({ success: true, message: "OTP sent to your email", redirect: "/otp-verification" });
    } else {
      res.redirect("/otp-verification");
    }
  } catch (error) {
    if (req.xhr) {
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
    next(error);
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
const verifyEmail = async (req, res, next) => {
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

    // Reward only the REFERRER (the user whose code was used)
    if (referredBy) {
      const actualReward = await rewardReferrer(referredBy, newUser._id);

      if (actualReward > 0) {
        const referrerWallet = await Wallet.findOne({ user_id: referredBy });
        if (referrerWallet) {
          referrerWallet.balance += actualReward;
          await referrerWallet.save();

          await WalletTransactions.create({
            user: referredBy,
            Amount: actualReward,
            Payment_status: 'credited',
            Wallet_id: referrerWallet._id,
            Payment_date: new Date(),
            Payment_time: new Date(),
            Description: `Referral reward – your friend ${newUser.Name} joined Zyrox`,
          });
        }
      }
    }

    await otpSchema.deleteMany({ Email });
    req.session.lastEmail = Email;
    delete req.session.tempUser;
    delete req.session.referredByCode;
    delete req.session.signupData;

    req.session.user = {
      _id: newUser._id,
      Name: newUser.Name,
      Email: newUser.Email,
      isAdmin: newUser.isAdmin,
      Profile_image: newUser.Profile_image,
    };

    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('json');

    if (isAjax) {
      await otpSchema.deleteMany({ Email });
      delete req.session.tempUser;
      delete req.session.referredByCode;
      delete req.session.signupData;
      return res.json({ success: true, message: "Registration Successful! Welcome to Zyrox.", redirect: "/" });
    }

    req.session.otpSuccess = "Registration Successful! Welcome to Zyrox.";
    req.session.otpSwal = true;

    res.redirect("/otp-verification");
  } catch (error) {
    if (req.xhr) return res.status(500).json({ success: false, message: "Internal server error" });
    next(error);
  }
};

/* =========================
   RESEND OTP
========================= */
const resendOtp = async (req, res, next) => {
  try {
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('json');
    const Email =
      req.session.tempUser?.Email ||
      req.session.resetEmail ||
      req.session.editEmail;

    if (!Email) {
      if (isAjax) return res.json({ success: false, message: "Session expired", redirect: "/" });
      return res.redirect("/");
    }

    const { OTP, hashedOtp } = await generateOtp();

    await otpSchema.deleteMany({ Email });
    await otpSchema.create({
      Email,
      Code: hashedOtp,
      ExpiresAt: new Date(Date.now() + 3 * 60 * 1000),
    });

    await sendOtpEmail(Email, OTP);

    if (isAjax) {
      return res.json({ success: true, message: "OTP resent successfully" });
    }

    req.session.otpSuccess = "OTP resent successfully";
    res.redirect("/otp-verification");
  } catch (error) {
    console.log("Resend OTP Error:", error);
    if (req.xhr) return res.status(500).json({ success: false, message: "Server Error" });
    res.status(500).send("Server Error");
  }
};

/* =========================
   SIGN IN
========================= */
const loadSignIn = (req, res) => {
  const { error, returnTo: queryReturnTo } = req.query;

  if (queryReturnTo) {
    req.session.returnTo = queryReturnTo;
  }

  const returnTo = req.session.returnTo || null;
  const loginErrors = req.session.loginErrors || {};
  const Email = req.session.loginEmail || "";
  const Password = req.session.loginPassword || "";

  delete req.session.loginErrors;
  delete req.session.loginEmail;
  delete req.session.loginPassword;

  res.render("user/auth/signInPage", {
    emailError: loginErrors.email || null,
    passError: loginErrors.password || null,
    Email,
    Password,
    error: error || null,
    returnTo,
  });
};

const userSignIn = async (req, res, next) => {
  try {
    const Email = req.body.email || req.body.Email;
    const Password = req.body.password || req.body.Password;
    const trimmedEmail = Email ? Email.trim().toLowerCase() : "";

    const emailRegex = /^[a-zA-Z0-9+._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('json');

    const handleError = (target, message, blocked = false) => {
      req.session.loginErrors = { [target]: message };
      req.session.loginEmail = trimmedEmail;
      req.session.loginPassword = Password;
      
      if (isAjax) {
        return res.json({ success: false, target, message, blocked });
      } else {
        return res.redirect("/signin");
      }
    };

    if (!emailRegex.test(trimmedEmail)) {
      return handleError("email", "Invalid email format");
    }

    if (!Password) {
      return handleError("password", "Password is required");
    }

    const user = await userSchema.findOne({ Email: trimmedEmail, isAdmin: false });

    if (!user)
      return handleError("email", "User not found");

    if (!user.isActive)
      return handleError("email", "Your account has been Deactivated by admin", true);

    if (user.googleId)
      return handleError("email", "This is a Google managed account");

    const isMatch = await bcrypt.compare(Password, user.Password);

    if (!isMatch)
      return handleError("password", "Incorrect Password");

    const adminSession = req.session.admin;
    const returnTo = req.session.returnTo || '/';

    req.session.regenerate((err) => {
      if (err) {
        if (isAjax) return res.json({ success: false, message: "Session error" });
        return res.redirect("/signin");
      }

      if (adminSession) {
        req.session.admin = adminSession;
      }

      req.session.user = {
        _id: user._id,
        Name: user.Name,
        Email: user.Email,
        Profile_image: user.Profile_image,
      };

      req.session.save((err) => {
        if (err) {
          if (isAjax) return res.json({ success: false, message: "Session save error" });
          return res.redirect("/signin");
        }
        if (isAjax) {
          res.json({ success: true, message: "Login Successful", returnTo });
        } else {
          res.redirect(returnTo);
        }
      });
    });
  } catch (error) {
    console.log("Signin Error:", error);
    next(error);
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
  const Email = req.session.resetEmail || "";
  delete req.session.emailError;
  delete req.session.resetEmail;

  res.render("user/auth/forgotPassword", {
    emailError,
    Email,
    clearLocalStorage: true,
  });
};

const sendResetOtp = async (req, res, next) => {
  try {
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('json');
    const trimmedEmail = (req.body.Email || req.body.email)?.trim().toLowerCase();
    req.session.resetEmail = trimmedEmail;

    const emailRegex = /^[a-zA-Z0-9+._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!emailRegex.test(trimmedEmail)) {
      if (isAjax) {
        return res.json({ success: false, message: "Invalid email format" });
      } else {
        req.session.emailError = "Invalid email format";
        return res.redirect("/forgot-password");
      }
    }

    const user = await userSchema.findOne({ Email: trimmedEmail });

    if (!user) {
      if (isAjax) {
        return res.json({ success: false, message: "User with this email does not exist" });
      } else {
        req.session.emailError = "User with this email does not exist";
        return res.redirect("/forgot-password");
      }
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
    req.session.otpSuccess = "OTP sent to your email";

    if (isAjax) {
      return res.json({ success: true, message: "OTP sent to your email", redirect: "/otp-verification" });
    } else {
      res.redirect("/otp-verification");
    }
  } catch (error) {
    if (req.xhr) {
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
    next(error);
  }
};

const verifyResetOtp = async (req, res, next) => {
  try {
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('json');
    const { A, B, C, D, E, F } = req.body;
    const Email = req.session.resetEmail;

    if (!Email) {
      if (isAjax) return res.json({ success: false, message: "Session expired", redirect: "/forgot-password" });
      return res.redirect("/forgot-password");
    }

    if (!A || !B || !C || !D || !E || !F) {
      if (isAjax) return res.json({ success: false, message: "Please enter complete OTP" });
      req.session.otpError = "Please enter complete OTP";
      return res.redirect("/otp-verification");
    }

    const otp = A + B + C + D + E + F;
    const validOTP = await otpSchema.findOne({ Email });

    if (!validOTP || validOTP.ExpiresAt < new Date()) {
      if (isAjax) return res.json({ success: false, message: "Invalid or Expired OTP" });
      req.session.otpError = "Invalid or Expired OTP";
      return res.redirect("/otp-verification");
    }

    const isMatch = await bcrypt.compare(otp, validOTP.Code);

    if (!isMatch) {
      if (isAjax) return res.json({ success: false, message: "Incorrect OTP" });
      req.session.otpError = "Incorrect OTP";
      return res.redirect("/otp-verification");
    }

    await otpSchema.deleteMany({ Email });
    req.session.isOtpVerified = true;
    
    if (isAjax) {
      return res.json({ success: true, message: "OTP Verified Successfully", redirect: "/new-password" });
    }

    req.session.otpSuccess = "OTP Verified Successfully";
    req.session.otpSwal = true;

    res.redirect("/otp-verification");
  } catch (error) {
    if (req.xhr) return res.status(500).json({ success: false, message: "Internal server error" });
    next(error);
  }
};

/* =========================
   RESET PASSWORD
========================= */
const loadNewPassword = (req, res) => {
  // if (!req.session.isOtpVerified) return res.redirect("/forgot-password");

  const passError = req.session.passError || null;
  const passSwal = !!req.session.passSwal;
  const formData = req.session.resetPasswordData || {};

  delete req.session.passError;
  delete req.session.passSwal;
  delete req.session.resetPasswordData;

  res.render("user/auth/resetPassword", { 
    passError, 
    passSwal,
    Password: formData.Password || "",
    confirmPassword: formData.confirmPassword || ""
  });
};

const resetPassword = async (req, res, next) => {
  try {
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.is('json');
    const { Password, confirmPassword } = req.body;
    const Email = req.session.resetEmail;

    if (!req.session.isOtpVerified || !Email) {
      if (isAjax) return res.json({ success: false, message: "Session expired", redirect: "/forgot-password" });
      return res.redirect("/forgot-password");
    }

    if (Password !== confirmPassword) {
      if (isAjax) return res.json({ success: false, message: "Passwords do not match" });
      req.session.passError = "Passwords do not match";
      req.session.resetPasswordData = { Password, confirmPassword };
      return res.redirect("/new-password");
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!Password || !passwordRegex.test(Password)) {
      const msg = "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.";
      if (isAjax) return res.json({ success: false, message: msg });
      req.session.passError = msg;
      req.session.resetPasswordData = { Password, confirmPassword };
      return res.redirect("/new-password");
    }

    const hashedPassword = await bcrypt.hash(Password.trim(), 10);

    await userSchema.updateOne({ Email }, { $set: { Password: hashedPassword } });

    delete req.session.resetEmail;
    delete req.session.isOtpVerified;

    if (isAjax) {
      return res.json({ success: true, message: "Password reset successfully", redirect: "/signin" });
    }

    req.session.passSwal = true;
    res.redirect("/new-password");
  } catch (error) {
    if (req.xhr) return res.status(500).json({ success: false, message: "Internal server error" });
    next(error);
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