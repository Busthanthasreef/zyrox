import express from "express";

import * as rateLimiter from "../middlewares/rateLimiter.js";

import * as userController from "../controllers/user/userController.js";
import * as productController from "../controllers/user/productController.js";
import * as addressController from "../controllers/user/addressController.js";
import * as checkoutController from "../controllers/user/checkoutController.js";
import * as profileController from "../controllers/user/profileController.js";
import * as cartController from "../controllers/user/cartController.js";
import * as wishlistController from "../controllers/user/wishlistController.js";
import * as orderController from "../controllers/user/orderController.js";
import * as walletController from "../controllers/user/walletController.js";
import { zyroChat } from "../controllers/user/zyroChatController.js";

import {
    isUserAuthenticated,
    isUserGuest,
    isUserBlocked
} from "../middlewares/auth.js";

import upload from "../middlewares/multer.js";

import { validateFiles } from "../utils/validation/fileValidator.js";

const userRoutes = express.Router();

/* =========================================================
   LANDING
========================================================= */

userRoutes.get(
    "/",
    isUserBlocked,
    userController.landingPage
);

userRoutes.get(
    "/products",
    isUserBlocked,
    productController.loadProducts
);

userRoutes.get(
    "/product/:id",
    isUserBlocked,
    productController.loadProductDetails
);

/* =========================================================
   SIGNUP
========================================================= */

userRoutes.get(
    "/signup",
    isUserGuest,
    userController.loadSignUp
);

userRoutes.post(
    "/signup",
    isUserGuest,
    rateLimiter.authLimiter,
    userController.userSignUp
);

userRoutes.get(
    "/otp-verification",
    userController.loadOtpPage
);

userRoutes.post(
    "/verify-otp",
    rateLimiter.otpLimiter,
    userController.verifyEmail
);

userRoutes.post(
    "/resend-otp",
    rateLimiter.otpLimiter,
    userController.resendOtp
);

/* =========================================================
   SIGNIN
========================================================= */

userRoutes.get(
    "/signin",
    isUserGuest,
    userController.loadSignIn
);

userRoutes.post(
    "/signin",
    isUserGuest,
    rateLimiter.authLimiter,
    userController.userSignIn
);

/* =========================================================
   FORGOT PASSWORD
========================================================= */

userRoutes.get(
    "/forgot-password",
    isUserGuest,
    userController.loadForgotPassword
);

userRoutes.post(
    "/forgot-password",
    isUserGuest,
    rateLimiter.passwordResetLimiter,
    userController.sendResetOtp
);

userRoutes.post(
    "/verify-reset-otp",
    rateLimiter.otpLimiter,
    userController.verifyResetOtp
);

userRoutes.post(
    "/resend-reset-otp",
    rateLimiter.otpLimiter,
    userController.resendOtp
);

/* =========================================================
   RESET PASSWORD
========================================================= */

userRoutes.get(
    "/new-password",
    userController.loadNewPassword
);

userRoutes.post(
    "/new-password",
    rateLimiter.passwordResetLimiter,
    userController.resetPassword
);

/* =========================================================
   PROFILE
========================================================= */

userRoutes.get(
    "/profile",
    isUserAuthenticated,
    isUserBlocked,
    profileController.userProfile
);

userRoutes.get(
    "/profile-edit",
    isUserAuthenticated,
    isUserBlocked,
    profileController.loadEditProfile
);

userRoutes.post(
    "/profile-edit",
    isUserAuthenticated,
    isUserBlocked,
    upload.single("profileImage"),
    validateFiles,
    profileController.editProfile
);

userRoutes.get(
    "/edit-email",
    isUserAuthenticated,
    isUserBlocked,
    profileController.loadEditEmail
);

userRoutes.post(
    "/edit-email",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.otpLimiter,
    profileController.editEmail
);

userRoutes.post(
    "/verify-edit-email-otp",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.otpLimiter,
    profileController.verifyEditEmailOtp
);

userRoutes.post(
    "/resend-edit-email-otp",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.otpLimiter,
    userController.resendOtp
);

userRoutes.post(
    "/verify-current-password",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.authLimiter,
    profileController.verifyCurrentPassword
);

userRoutes.get(
    "/change-password",
    isUserAuthenticated,
    isUserBlocked,
    profileController.changePassword
);

userRoutes.post(
    "/change-password",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.authLimiter,
    profileController.updatePassword
);

userRoutes.get(
    "/add-password",
    isUserAuthenticated,
    isUserBlocked,
    profileController.changePassword
);

userRoutes.post(
    "/add-password",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.authLimiter,
    profileController.addPassword
);

/* =========================================================
   ADDRESS
========================================================= */

userRoutes.get(
    "/address",
    isUserAuthenticated,
    isUserBlocked,
    addressController.LoadUserAddress
);

userRoutes.get(
    "/address-add",
    isUserAuthenticated,
    isUserBlocked,
    addressController.loadAddAddress
);

userRoutes.post(
    "/address-add",
    isUserAuthenticated,
    isUserBlocked,
    addressController.addAddress
);

userRoutes.get(
    "/address-edit/:id",
    isUserAuthenticated,
    isUserBlocked,
    addressController.loadEditAddress
);

userRoutes.post(
    "/address-edit/:id",
    isUserAuthenticated,
    isUserBlocked,
    addressController.updateAddress
);

userRoutes.patch(
    "/address-default/:id",
    isUserAuthenticated,
    isUserBlocked,
    addressController.setDefaultAddress
);

userRoutes.delete(
    "/address-delete/:id",
    isUserAuthenticated,
    isUserBlocked,
    addressController.deleteAddress
);

/* =========================================================
   CART
========================================================= */

userRoutes.get(
    "/cart",
    isUserAuthenticated,
    isUserBlocked,
    cartController.loadCart
);

userRoutes.post(
    "/cart/add",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.cartLimiter,
    cartController.addToCart
);

userRoutes.post(
    "/cart/update-quantity",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.cartLimiter,
    cartController.updateQuantity
);

userRoutes.post(
    "/cart/remove",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.cartLimiter,
    cartController.removeFromCart
);

userRoutes.post(
    "/cart/clear",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.cartLimiter,
    cartController.clearCart
);

/* =========================================================
   WISHLIST
========================================================= */

userRoutes.post(
    "/wishlist/toggle",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.cartLimiter,
    wishlistController.toggleWishlist
);

userRoutes.get(
    "/wishlist",
    isUserAuthenticated,
    isUserBlocked,
    wishlistController.loadWishlist
);

/* =========================================================
   CHECKOUT
========================================================= */

userRoutes.get(
    "/checkout",
    isUserAuthenticated,
    isUserBlocked,
    checkoutController.loadCheckout
);

userRoutes.get(
    "/checkout/buy-now",
    isUserAuthenticated,
    isUserBlocked,
    checkoutController.loadBuyNowCheckout
);

userRoutes.post(
    "/checkout/create-razorpay-order",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.paymentLimiter,
    checkoutController.createRazorpayOrder
);

userRoutes.post(
    "/checkout/verify-razorpay",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.paymentLimiter,
    checkoutController.verifyRazorpayPayment
);

userRoutes.post(
    "/checkout/place-order",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.paymentLimiter,
    checkoutController.placeOrder
);

userRoutes.get(
    "/order-success/:orderId",
    isUserAuthenticated,
    isUserBlocked,
    checkoutController.getOrderSuccess
);

userRoutes.get(
    "/payment-failed",
    isUserAuthenticated,
    isUserBlocked,
    checkoutController.getPaymentFailed
);

userRoutes.post(
    "/checkout/record-failed-order",
    isUserAuthenticated,
    isUserBlocked,
    checkoutController.recordFailedOrder
);

userRoutes.post(
    "/checkout/retry-payment",
    isUserAuthenticated,
    isUserBlocked,
    checkoutController.retryPayment
);

userRoutes.post(
    "/checkout/confirm-retry-payment",
    isUserAuthenticated,
    isUserBlocked,
    checkoutController.confirmRetryPayment
);

/* =========================================================
   COUPON API
========================================================= */

userRoutes.post(
    "/api/coupon/apply",
    isUserAuthenticated,
    isUserBlocked,
    checkoutController.applyCoupon
);

userRoutes.post(
    "/api/coupon/remove",
    isUserAuthenticated,
    isUserBlocked,
    checkoutController.removeCoupon
);

/* =========================================================
   ORDERS
========================================================= */

userRoutes.get(
    "/myOrders",
    isUserAuthenticated,
    isUserBlocked,
    orderController.getOrdersPage
);

userRoutes.get(
    "/myOrders/details",
    isUserAuthenticated,
    isUserBlocked,
    orderController.getOrdersDetailsPage
);

userRoutes.get(
    "/myOrders/invoice",
    isUserAuthenticated,
    isUserBlocked,
    orderController.getInvoicePage
);

userRoutes.post(
    "/cancel-order",
    isUserAuthenticated,
    isUserBlocked,
    orderController.cancelOrder
);

userRoutes.post(
    "/cancel-item",
    isUserAuthenticated,
    isUserBlocked,
    orderController.cancelItem
);

userRoutes.post(
    "/return-item",
    isUserAuthenticated,
    isUserBlocked,
    orderController.returnItem
);

userRoutes.post(
    "/return-order",
    isUserAuthenticated,
    isUserBlocked,
    orderController.returnOrder
);

/* =========================================================
   WALLET
========================================================= */

userRoutes.get(
    "/wallet",
    isUserAuthenticated,
    isUserBlocked,
    walletController.getWallet
);

userRoutes.post(
    "/wallet/add-money",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.paymentLimiter,
    walletController.createWalletOrder
);

userRoutes.post(
    "/wallet/verify-payment",
    isUserAuthenticated,
    isUserBlocked,
    rateLimiter.paymentLimiter,
    walletController.verifyWalletPayment
);

userRoutes.get(
    "/wallet/payment-failure",
    isUserAuthenticated,
    isUserBlocked,
    walletController.getPaymentFailure
);

/* =========================================================
   ZYRO AI CHAT
========================================================= */

userRoutes.post(
    "/api/zyro-chat",
    isUserBlocked,
    zyroChat
);

/* =========================================================
   LOGOUT
========================================================= */

userRoutes.get(
    "/logout",
    isUserAuthenticated,
    userController.logout
);

export default userRoutes;