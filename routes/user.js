import express from "express";
import * as userController from "../controllers/user/userController.js";
import * as productController from "../controllers/user/productController.js"
import * as addressController from "../controllers/user/addressController.js";
import * as checkoutController from "../controllers/user/checkoutController.js";
import * as profileController from "../controllers/user/profileController.js";
import * as cartController from "../controllers/user/cartController.js"
import * as wishlistController from "../controllers/user/wishlistController.js"
import * as orderController from "../controllers/user/orderController.js"
import { isUserAuthenticated, isUserGuest } from "../middlewares/auth.js";
import upload from "../middlewares/multer.js";
import Coupon from "../models/coupon.js";

const userRoutes = express.Router();

/* LANDING */
userRoutes.get("/", userController.landingPage);

userRoutes.get('/products', productController.loadProducts);
userRoutes.get('/product/:id', productController.loadProductDetails);

userRoutes.get("/cart",                isUserAuthenticated, cartController.loadCart);
userRoutes.post("/cart/add",           isUserAuthenticated, cartController.addToCart);
userRoutes.post("/cart/update-quantity", isUserAuthenticated, cartController.updateQuantity);
userRoutes.post("/cart/remove",        isUserAuthenticated,cartController.removeFromCart);
userRoutes.post("/cart/clear",         isUserAuthenticated, cartController.clearCart);


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
userRoutes.post('/wishlist/toggle', wishlistController.toggleWishlist);
userRoutes.get('/wishlist', isUserAuthenticated, wishlistController.loadWishlist);


userRoutes.get("/checkout", isUserAuthenticated, checkoutController.loadCheckout);
userRoutes.get("/checkout/buy-now", isUserAuthenticated, checkoutController.loadBuyNowCheckout);
userRoutes.post("/checkout/create-razorpay-order", isUserAuthenticated, checkoutController.createRazorpayOrder);
userRoutes.post("/checkout/verify-razorpay", isUserAuthenticated, checkoutController.verifyRazorpayPayment);
userRoutes.post("/checkout/place-order", isUserAuthenticated, checkoutController.placeOrder);
userRoutes.get("/order-success/:orderId", isUserAuthenticated, checkoutController.getOrderSuccess);

/* COUPONS */
userRoutes.post("/api/coupon/apply",    isUserAuthenticated, checkoutController.applyCoupon);
userRoutes.post("/api/coupon/remove",   isUserAuthenticated, checkoutController.removeCoupon);

userRoutes.get("/myOrders",isUserAuthenticated, orderController.getOrdersPage);
userRoutes.get("/myOrders/details",isUserAuthenticated, orderController.getOrdersDetailsPage);
userRoutes.get("/myOrders/invoice",isUserAuthenticated, orderController.getInvoicePage);
userRoutes.post("/cancel-order", isUserAuthenticated, orderController.cancelOrder);
userRoutes.post("/cancel-item", isUserAuthenticated, orderController.cancelItem);
userRoutes.post("/return-item", isUserAuthenticated, orderController.returnItem);
userRoutes.post("/return-order", isUserAuthenticated, orderController.returnOrder);

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


/* COUPONS API */
// userRoutes.get("/api/coupons", isUserAuthenticated, async (req, res) => {
//     try {
//         const now = new Date();
//         const coupons = await Coupon.find({
//             isActive: true,
//             validFrom: { $lte: now },
//             validTill: { $gte: now },
//             $or: [
//                 { usageLimit: null },
//                 { $expr: { $lt: ["$usedCount", "$usageLimit"] } }
//             ]
//         }).sort({ createdAt: -1 }).lean();
//         res.json({ success: true, coupons });
//     } catch (err) {
//         console.error("Error fetching coupons:", err);
//         res.status(500).json({ success: false, message: "Server error" });
//     }
// });

export default userRoutes;
