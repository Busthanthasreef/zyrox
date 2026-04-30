import generateOtp from "../../utils/otpGenerator.js"
import userSchema from "../../models/user.js";
import otpSchema from "../../models/otp.js"
import Category from "../../models/category.js";
import Cart from "../../models/cart.js";
import Wishlist from "../../models/wishlist.js";
import { sendOtpEmail } from "../../utils/otpController.js";
import bcrypt from "bcryptjs";

/* =========================
   Date Formatter
========================= */
const formatDate = (date) => {
  const day = date.getDate();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month}, ${year}`;
};

/* =========================
   User Profile
========================= */
const userProfile = async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.redirect("/signin");
    }

    const [user, categories, cartItemCount, wishlist] = await Promise.all([
      userSchema.findById(req.session.user._id),
      Category.find({ IsDeleted: { $ne: true }, IsActive: { $ne: false } }).lean(),
      Cart.findOne({ User_id: req.session.user._id }).select("Items").lean().then(cart => cart?.Items?.length || 0),
      Wishlist.findOne({ User_id: req.session.user._id }).select("Products").lean().then(w => w?.Products?.length || 0)
    ]);

    if (!user) {
      return res.redirect("/signin");
    }

    const isGoogleUser = !!user.googleId;
    const hasPassword = !!user.Password;
    const passwordToast = req.session.passwordAddedToast || null;
    delete req.session.passwordAddedToast;

    // Password modal state (errors / messages from change-password form)
    const errors = req.session.passwordErrors || {};
    const errorMessage = req.session.passwordError || null;
    const successMessage = req.session.passwordSuccess || null;
    delete req.session.passwordErrors;
    delete req.session.passwordError;
    delete req.session.passwordSuccess;
    const profileSuccess = req.session.profileSuccess || null;
    delete req.session.profileSuccess;

    res.render("user/profile/userProfile", {
      user,
      userProfileImage: user.Profile_image,
      createdAt: formatDate(user.createdAt),
      isGoogleUser,
      hasPassword,
      passwordToast,
      phError: null,
      errors,
      errorMessage,
      successMessage,
      profileSuccess,
      categories,
      cartItemCount,
      wishlistCount: wishlist,
      currentPage: 'profile'
    });
  } catch (error) {
    next(error);
  }
};

/* =========================4
   Load Edit Profile
========================= */
const loadEditProfile = async (req, res, next) => {
  try {
    const [user, categories, cartItemCount, wishlist] = await Promise.all([
      userSchema.findById(req.session.user._id),
      Category.find({ IsDeleted: { $ne: true }, IsActive: { $ne: false } }).lean(),
      Cart.findOne({ User_id: req.session.user._id }).select("Items").lean().then(cart => cart?.Items?.length || 0),
      Wishlist.findOne({ User_id: req.session.user._id }).select("Products").lean().then(w => w?.Products?.length || 0)
    ]);
    const isGoogleUser = !!user.googleId;

    res.render("user/profile/editProfile", {
      user: {
        _id: user._id,
        Name: user.Name,
        Email: user.Email,
        Phone_number: user.Phone_number || "",
        Profile_image: user.Profile_image,
      },
      isGoogleUser,
      phoneError: null,
      emailError: null,
      nameError: null,
      categories,
      cartItemCount,
      wishlistCount: wishlist,
      currentPage: 'profile'
    });
  } catch (error) {
    next(error);
  }
};

/* =========================
   Edit Profile
   ========================= */
const editProfile = async (req, res, next) => {
  try {
    const { Name, Email, phoneNumber, removeImage } = req.body;
    const user = await userSchema.findById(req.session.user._id);
    const isGoogleUser = !!user.googleId;


    // Helper for rendering with error
    const renderError = (errors = {}) => {
      return res.render("user/profile/editProfile", {
        user: {
          _id: user._id,
          Name: Name || user.Name,
          Email: Email || user.Email,
          Phone_number: phoneNumber || user.Phone_number,
          Profile_image: (req.file ? req.file.path : user.Profile_image),
        },
        isGoogleUser,
        phoneError: errors.phoneNumber || null,
        emailError: errors.Email || null,
        nameError: errors.Name || null,
      });
    };

    const trimmedName = Name ? Name.trim() : "";
    const trimmedEmail = Email ? Email.trim() : "";
    const trimmedPhone = phoneNumber ? phoneNumber.trim() : "";

    const errors = {};

    // Name validation
    const nameRegex = /^[A-Za-z\s]{3,50}$/;
    if (!trimmedName || !nameRegex.test(trimmedName)) {
      errors.Name = "Enter a valid name (3-50 letters only allowed here)";
    }

    // Phone validation
    const indianPhone = /^[6-9]\d{9}$/;
    if (trimmedPhone && trimmedPhone !== "") {
      if (!indianPhone.test(trimmedPhone)) {
        errors.phoneNumber =
          "Enter a valid 10-digit indian phone number starting with 6-9";
      }
    }

    // Email validation (only if editable)
    if (!isGoogleUser && trimmedEmail) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(trimmedEmail)) {
        errors.Email = "Invalid email format";
      } else if (trimmedEmail !== user.Email) {
        // Check if email already exists
        const existingUser = await userSchema.findOne({ Email: trimmedEmail });

        if (existingUser) {
          errors.Email = "Email already in use by another account";
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return renderError(errors);
    }

    // Update fields
    user.Name = trimmedName;
    user.Phone_number = trimmedPhone;

    if (!isGoogleUser && trimmedEmail) {
      user.Email = trimmedEmail;
    }

    // Handle profile image update
    if (removeImage === "true") {
      user.Profile_image = "/images/default-avatar.png";
    } else if (req.file) {
      user.Profile_image = req.file.path;
    } else if (req.body.pendingImage) {
      // Use the image that was uploaded in a previous (failed) attempt
      user.Profile_image = req.body.pendingImage;
    }

    await user.save();

    // Update session info
    req.session.user.Name = user.Name;
    req.session.user.Email = user.Email;
    req.session.user.Profile_image = user.Profile_image;

    req.session.profileSuccess = "Profile updated successfully!";

    res.redirect("/profile");
  } catch (error) {
    next(error);
  }
};


const loadEditEmail = async (req, res) => {
   try{
  
  const user= req.session.user;
  const userId=user._id;
  const [categories, cartItemCount, wishlist] = await Promise.all([
    Category.find({ IsDeleted: { $ne: true }, IsActive: { $ne: false } }).lean(),
    Cart.findOne({ User_id: userId }).select("Items").lean().then(cart => cart?.Items?.length || 0),
    Wishlist.findOne({ User_id: userId }).select("Products").lean().then(w => w?.Products?.length || 0)
  ]);
  const errors=req.session.formErrors ||{};
  const Email = req.session.editEmail || "";
  delete req.session.formErrors;
  delete req.session.editEmail;

    res.render("user/profile/editEmail",{user,errors,Email,userId, categories, cartItemCount, wishlistCount: wishlist, currentPage: 'profile'})
   }catch(error){
    console.log(error.message)
   }
}


const editEmail = async (req, res, next) => {
  try {
    const { Email } = req.body;
    const { OTP, hashedOtp } = await generateOtp();

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const errors = {};

    if (!Email || Email.trim() === "") {
      errors.email = "enter an email";
    } else if (!emailRegex.test(Email)) {
      errors.email = "invalid Email, Please Enter a valid Email";
    } else {
      const user = await userSchema.findOne({ Email });
      if (user) errors.email = "this user already Exists";
    }

    if (Object.keys(errors).length > 0) {
      req.session.formErrors = errors;
      req.session.editEmail = Email;
      return res.redirect("/edit-email");
    }

    await otpSchema.deleteMany({ Email });
    
    await otpSchema.create({
      Code: hashedOtp,        // ✅ fix 1 — uppercase C
      Email: Email,
      ExpiresAt: new Date(Date.now() + 3 * 60 * 1000),
    });

    await sendOtpEmail(Email, OTP);

    req.session.editEmail = Email; // ✅ change from resetEmail to editEmail
    res.redirect("/otp-verification");

  } catch (error) {
    next(error);
  }
};

const verifyEditEmailOtp = async (req, res, next) => {
  try {
    const { A, B, C, D, E, F } = req.body;
    const Email = req.session.editEmail;

    if (!Email) return res.redirect("/edit-email");

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

    // Update user's email
    const user = await userSchema.findById(req.session.user._id);
    user.Email = Email;
    await user.save();

    // Update session
    req.session.user.Email = Email;

    await otpSchema.deleteMany({ Email });
    delete req.session.editEmail;

    req.session.otpSuccess = "Email updated successfully";
    req.session.otpSwal = true;
    res.redirect("/otp-verification");
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res) => {
  try {
    const [user, categories, cartItemCount, wishlist] = await Promise.all([
      userSchema.findById(req.session.user._id),
      Category.find({ IsDeleted: { $ne: true }, IsActive: { $ne: false } }).lean(),
      Cart.findOne({ User_id: req.session.user._id }).select("Items").lean().then(cart => cart?.Items?.length || 0),
      Wishlist.findOne({ User_id: req.session.user._id }).select("Products").lean().then(w => w?.Products?.length || 0)
    ]);
    const isGoogleUser = !!user.googleId;
    const hasPassword = !!user.Password;

    const errors = req.session.passwordErrors || {};
    const successMessage = req.session.passwordSuccess || null;
    const errorMessage = req.session.passwordError || null;

    delete req.session.passwordErrors;
    delete req.session.passwordSuccess;
    delete req.session.passwordError;

    res.render("user/profile/changePassword", {
      errors,
      successMessage,
      errorMessage,
      isGoogleUser,
      hasPassword,
      categories,
      cartItemCount,
      wishlistCount: wishlist,
      currentPage: 'profile'
    });
  } catch (error) {
    console.log("Change Password Load Error:", error);
    res.status(500).send("Server Error");
  }
};

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

    const user = await userSchema.findById(req.session.user._id);
    const hasPassword = !!user.Password;

    if (!hasPassword) {
      return res.redirect("/add-password");
    }

    const errors = {};
    if (!newPassword) errors.newPassword = "New password is required";
    else if (!passwordRegex.test(newPassword))
      errors.newPassword = "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.";
    
    if (!confirmPassword) errors.confirmPassword = "confirm password is required";
    if (newPassword !== confirmPassword)
      errors.confirmPassword = "Passwords do not match";

    if (Object.keys(errors).length > 0) {
      req.session.passwordErrors = errors;
      return res.redirect("/profile");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.Password);
    if (!isMatch) {
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(400).json({ success: false, message: "Incorrect current password" });
      }
      req.session.passwordErrors = {
        currentPassword: "Incorrect current password",
      };
      return res.redirect("/profile");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.Password = hashedPassword;
    await user.save();

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, message: "Password updated successfully!" });
    }

    req.session.passwordSuccess = "Password updated successfully!";
    res.redirect("/profile");
  } catch (error) {
    console.log("Update Password Error:", error);
    res.status(500).send("Server Error");
  }
};

const addPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const user = await userSchema.findById(req.session.user._id);
    const isGoogleUser = !!user.googleId;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    const isJsonRequest = req.headers.accept && req.headers.accept.includes('application/json');

    if (!isGoogleUser) {
      if (isJsonRequest) return res.status(403).json({ success: false, message: "This action is only available for Google accounts." });
      return res.redirect("/change-password");
    }

    const errors = {};
    if (!newPassword) errors.newPassword = "Password is required";
    else if (!passwordRegex.test(newPassword))
      errors.newPassword = "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.";
    if (!confirmPassword) errors.confirmPassword = "Please confirm your password";
    if (newPassword && confirmPassword && newPassword !== confirmPassword)
      errors.confirmPassword = "Passwords do not match";

    if (Object.keys(errors).length > 0) {
      if (isJsonRequest) {
        const firstError = Object.values(errors)[0];
        return res.status(400).json({ success: false, message: firstError });
      }
      req.session.passwordErrors = errors;
      return res.redirect("/profile");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.Password = hashedPassword;
    await user.save();

    if (isJsonRequest) {
      return res.json({ success: true, message: "Password set successfully! You can now log in with your email too." });
    }

    req.session.passwordAddedToast = true;
    res.redirect("/profile");
  } catch (error) {
    console.log("Add Password Error:", error);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
    res.status(500).send("Server Error");
  }
};

const verifyCurrentPassword = async (req, res) => {
  try {
    const { currentPassword } = req.body;
    const user = await userSchema.findById(req.session.user._id);

    if (!user || !user.Password) {
      return res.status(400).json({ success: false, message: "User not found or password not set" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.Password);
    if (isMatch) {
      return res.json({ success: true });
    } else {
      return res.status(400).json({ success: false, message: "Incorrect current password" });
    }
  } catch (error) {
    console.error("Verify Password Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export {
  userProfile,
  loadEditProfile,
  editProfile,
  loadEditEmail,
  editEmail,
  changePassword,
  updatePassword,
  addPassword,
  verifyEditEmailOtp,
  verifyCurrentPassword,
};
