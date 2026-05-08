import rateLimit from "express-rate-limit";

// ---------------- GENERAL ----------------

export const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 200,
    message: {
        success: false,
        message: "Too many requests. Please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false
});

// ---------------- AUTH ----------------

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        message: "Too many login attempts. Try again after 15 minutes."
    },
    standardHeaders: true,
    legacyHeaders: false
});

// ---------------- OTP ----------------

export const otpLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 3,
    message: {
        success: false,
        message: "Too many OTP requests. Try again after 5 minutes."
    },
    standardHeaders: true,
    legacyHeaders: false
});

// ---------------- PASSWORD RESET ----------------

export const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: {
        success: false,
        message: "Too many password reset attempts."
    },
    standardHeaders: true,
    legacyHeaders: false
});

// ---------------- PAYMENT ----------------

export const paymentLimiter = rateLimit({
    windowMs: 2 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        message: "Too many payment requests."
    },
    standardHeaders: true,
    legacyHeaders: false
});

// ---------------- CART ----------------

export const cartLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: {
        success: false,
        message: "Too many cart actions."
    },
    standardHeaders: true,
    legacyHeaders: false
});