import generateOtp from "../../utils/otpGenerator.js"
import userSchema from "../../models/user.js";
import otpSchema from "../../models/otp.js"
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
const userProfile = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/signin");
    }

    const user = await userSchema.findById(req.session.user._id);

    if (!user) {
      return res.redirect("/signin");
    }

    const isGoogleUser = !!user.googleId;
    const defaultImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.Name)}&background=00ff88&color=000&size=130`;
    const hasPassword = !!user.Password;
    const passwordToast = req.session.passwordAddedToast || null;
    delete req.session.passwordAddedToast;

    res.render("user/profile/userProfile", {
      user: {
        _id: user._id,
        Name: user.Name,
        Email: user.Email,
        Phone_number: user.Phone_number || "Not provided",
        Profile_image: user.Profile_image || defaultImage,
        Department: user.Department || "",
        createdAt: formatDate(user.createdAt),
      },
      isGoogleUser,
      hasPassword,
      passwordToast,
      phError: null,
    });
  } catch (error) {
    console.log("Profile Error:", error);
    res.status(500).send("Server Error");
  }
};

/* =========================4
   Load Edit Profile
========================= */
const loadEditProfile = async (req, res) => {
  try {
    const user = await userSchema.findById(req.session.user._id);
    const isGoogleUser = !!user.googleId;
    const defaultImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.Name)}&background=00ff88&color=000&size=130`;

    res.render("user/profile/editProfile", {
      user: {
        _id: user._id,
        Name: user.Name,
        Email: user.Email,
        Phone_number: user.Phone_number || "",
        Profile_image: user.Profile_image || defaultImage,
      },
      isGoogleUser,
      phoneError: null,
      emailError: null,
      nameError: null,
    });
  } catch (error) {
    console.log("Edit Profile Load Error:", error);
    res.status(500).send("Server Error");
  }
};

/* =========================
   Edit Profile
   ========================= */
const editProfile = async (req, res) => {
  try {
    const { Name, Email, phoneNumber, removeImage } = req.body;
    const user = await userSchema.findById(req.session.user._id);
    const isGoogleUser = !!user.googleId;
    const defaultImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.Name)}&background=00ff88&color=000&size=130`;

    // Helper for rendering with error
    const renderError = (errors = {}) => {
      return res.render("user/profile/editProfile", {
        user: {
          _id: user._id,
          Name: Name || user.Name,
          Email: Email || user.Email,
          Phone_number: phoneNumber || user.Phone_number,
          Profile_image: (req.file ? req.file.path : user.Profile_image) || defaultImage,
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
      user.Profile_image = "";
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

    res.redirect("/profile");
  } catch (error) {
    console.log("Edit Profile Error:", error);
    res.status(500).send("Server Error");
  }
};


const loadEditEmail=(req,res)=>{
   try{
  
  const user= req.session.user;
  const userId=user._id;
  const errors=req.session.formErrors ||{};
  delete req.session.formErrors;

    res.render("user/profile/editEmail",{user,errors,userId})
   }catch(error){
    console.log(error.message)
   }
}


const editEmail = async (req, res) => {
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
    console.log("Edit Email Error:", error);
    res.status(500).send("Server Error"); // ✅ fix 3
  }
};

const verifyEditEmailOtp = async (req, res) => {
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
    console.log("Verify Edit Email OTP Error:", error);
    res.status(500).send("Server Error");
  }
};

const changePassword = async (req, res) => {
  try {
    const user = await userSchema.findById(req.session.user._id);
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
    });
  } catch (error) {
    console.log("Change Password Load Error:", error);
    res.status(500).send("Server Error");
  }
};

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;

    const user = await userSchema.findById(req.session.user._id);
    const hasPassword = !!user.Password;

    if (!hasPassword) {
      return res.redirect("/add-password");
    }

    const errors = {};
    if (!newPassword) errors.newPassword = "New password is required";
    else if (!passwordRegex.test(newPassword))
      errors.newPassword = "Password must be at least 8 characters long and contain at least one letter and one number";
    
    if (!confirmPassword) errors.confirmPassword = "confirm password is required";
    if (newPassword !== confirmPassword)
      errors.confirmPassword = "Passwords do not match";

    if (Object.keys(errors).length > 0) {
      req.session.passwordErrors = errors;
      return res.redirect("/change-password");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.Password);
    if (!isMatch) {
      req.session.passwordErrors = {
        currentPassword: "Incorrect current password",
      };
      return res.redirect("/change-password");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.Password = hashedPassword;
    await user.save();

    req.session.passwordSuccess = "Password updated successfully!";
    res.redirect("/change-password");
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
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!isGoogleUser) {
      return res.redirect("/change-password");
    }

    const errors = {};
    if (!newPassword) errors.newPassword = "Password is required";
    else if (!passwordRegex.test(newPassword))
      errors.newPassword = "Password must be at least 8 characters long and contain at least one letter and one number";
    if (!confirmPassword) errors.confirmPassword = "confirm password is required";
    if (newPassword !== confirmPassword)
      errors.confirmPassword = "Passwords do not match";

    if (Object.keys(errors).length > 0) {
      req.session.passwordErrors = errors;
      return res.redirect("/add-password");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.Password = hashedPassword;
    await user.save();

    req.session.passwordAddedToast = true;
    res.redirect("/profile");
  } catch (error) {
    console.log("Add Password Error:", error);
    res.status(500).send("Server Error");
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
};
