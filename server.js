import "dotenv/config";
import rateLimit from "express-rate-limit";
import express from "express";
import connectDB from "./config/db.js";
import session from "express-session";
import adminRoutes from "./routes/admin.js"; 
import userRoutes from "./routes/user.js"; 
import authRoutes from "./routes/auth.js"
import { notFoundHandler, errorHandler } from "./middlewares/error.js"; 
import passport from "./config/passport.js"
import attachLocalCounts from "./middlewares/locals.js";
import nocache from "nocache";
import crypto from "node:crypto";

const app = express();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false
});

const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required in production.");
}
if (!process.env.SESSION_SECRET && !isProduction) {
    console.warn("SESSION_SECRET is not set. Using a temporary in-memory secret for development.");
}

// Database Connection
await connectDB();

app.set("view engine","ejs");
app.use(nocache());
app.use(limiter);

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: "session",
    cookie: {
        secure: process.env.NODE_ENV === "production", 
        maxAge: 1000 * 60 * 60 * 24 
    }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(attachLocalCounts);

app.use("/admin", adminRoutes);
app.use("/", userRoutes);
app.use("/auth", authRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 2999;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));