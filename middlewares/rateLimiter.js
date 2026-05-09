import rateLimit from "express-rate-limit";

const rateLimitHandler = (req, res, next, options) => {
    const message = (typeof options.message === 'object' && options.message.message) 
        ? options.message.message 
        : (typeof options.message === 'string' ? options.message : 'Too many requests');

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(options.statusCode).json({ success: false, message });
    }
    
    // For standard requests, return a transparent script that shows a SweetAlert
    // and then redirects the user back to where they came from.
    res.status(options.statusCode).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css"/>
            <style>
                body { 
                    background: #0f172a; 
                    margin: 0; 
                    font-family: 'Inter', sans-serif;
                }
                .swal2-popup {
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
                }
            </style>
        </head>
        <body>
            <script>
                document.addEventListener('DOMContentLoaded', () => {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Slow Down!',
                        text: ${JSON.stringify(message)},
                        background: '#0f172a',
                        color: '#fff',
                        confirmButtonColor: '#3b82f6',
                        iconColor: '#3b82f6',
                        backdrop: 'rgba(15, 23, 42, 0.9)',
                        showClass: { popup: 'animate__animated animate__fadeInDown' },
                        hideClass: { popup: 'animate__animated animate__fadeOutUp' }
                    }).then(() => {
                        if (window.history.length > 1) {
                            window.history.back();
                        } else {
                            window.location.href = '/';
                        }
                    });
                });
            </script>
        </body>
        </html>
    `);
};

// ---------------- GENERAL ----------------

export const generalLimiter = rateLimit({
    windowMs: 3 * 60 * 1000,
    max: 200,
    message: {
        success: false,
        message: "Too many requests. Please try again later."
    },
    handler: rateLimitHandler,
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
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false
});

// ---------------- OTP ----------------

export const otpLimiter = rateLimit({
    windowMs: 3 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        message: "Too many OTP requests. Try again after 3 minutes."
    },
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false
});

// ---------------- PASSWORD RESET ----------------

export const passwordResetLimiter = rateLimit({
    windowMs: 3 * 60 * 1000,
    max: 3,
    message: {
        success: false,
        message: "Too many password reset attempts.try again after 3 miniutes"
    },
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false
});

// ---------------- PAYMENT ----------------

export const paymentLimiter = rateLimit({
    windowMs: 2 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        message: "Too many payment requests.try again after 2 minutes"
    },
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false
});

// ---------------- CART ----------------

export const cartLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: {
        success: false,
        message: "Too many cart actions.try again after some times"
    },
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false
});