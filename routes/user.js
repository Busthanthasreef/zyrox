import express from "express";
import * as userController from "../controllers/user/userController.js";
import * as productController from "../controllers/user/productController.js"
import * as addressController from "../controllers/user/addressController.js";
import * as profileController from "../controllers/user/profileController.js";
import * as cartController from "../controllers/user/cartController.js"
import { isUserAuthenticated, isUserGuest } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js";

const userRoutes = express.Router();

/* LANDING */
userRoutes.get("/", userController.landingPage);

userRoutes.get('/products', productController.loadProducts)
/* SIGNUP */
userRoutes.get("/signup", isUserGuest, userController.loadSignUp);
userRoutes.post("/signup", isUserGuest, userController.userSignUp);
userRoutes.get("/otp-verification", userController.loadOtpPage);
userRoutes.post("/verify-otp", userController.verifyEmail);
userRoutes.post("/resend-otp", userController.resendOtp);

/* SIGNIN */
userRoutes.get("/signin", isUserGuest, userController.loadSignIn);
userRoutes.post("/signin", isUserGuest, userController.userSignIn);

/* PROFILE - PROTECTED ROUTES */
userRoutes.get('/cart',isUserAuthenticated,cartController.loadCart)


userRoutes.get("/profile", isUserAuthenticated, profileController.userProfile);
userRoutes.get("/profile-edit", isUserAuthenticated, profileController.loadEditProfile);
userRoutes.post("/profile-edit", isUserAuthenticated, upload.single("profileImage"), profileController.editProfile);
userRoutes.get("/edit-email", isUserAuthenticated, profileController.loadEditEmail)
userRoutes.post("/edit-email", isUserAuthenticated, profileController.editEmail)
userRoutes.post("/verify-edit-email-otp", isUserAuthenticated, profileController.verifyEditEmailOtp);
userRoutes.post("/resend-edit-email-otp", isUserAuthenticated, userController.resendOtp);
userRoutes.get("/change-password", isUserAuthenticated, profileController.changePassword);
userRoutes.post("/change-password", isUserAuthenticated, profileController.updatePassword);
userRoutes.get("/add-password", isUserAuthenticated, profileController.changePassword);
userRoutes.post("/add-password", isUserAuthenticated, profileController.addPassword);


userRoutes.get("/address", isUserAuthenticated, addressController.LoadUserAddress);
userRoutes.get("/address-add", isUserAuthenticated, addressController.loadAddAddress);
userRoutes.post("/address-add", isUserAuthenticated, addressController.addAddress);
userRoutes.get("/address-edit/:id", isUserAuthenticated, addressController.loadEditAddress);
userRoutes.post("/address-edit/:id", isUserAuthenticated, addressController.updateAddress);
userRoutes.patch("/address-default/:id", isUserAuthenticated, addressController.setDefaultAddress);
userRoutes.delete("/address-delete/:id", isUserAuthenticated, addressController.deleteAddress);


/* LOGOUT */
userRoutes.get("/logout", isUserAuthenticated, userController.logout);

/* FORGOT PASSWORD */
userRoutes.get("/forgot-password", isUserGuest, userController.loadForgotPassword);
userRoutes.post("/forgot-password", isUserGuest, userController.sendResetOtp);
userRoutes.post("/verify-reset-otp", userController.verifyResetOtp);
userRoutes.post("/resend-reset-otp", userController.resendOtp); // Reusing resendOtp or creating a specific one if needed

/* RESET PASSWORD */
userRoutes.get("/new-password", userController.loadNewPassword);
userRoutes.post("/new-password", userController.resetPassword);

export default userRoutes;
