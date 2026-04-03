import "dotenv/config";
import express from "express";
import connectDB from "./config/db.js";
import session from "express-session";
import adminRoutes from "./routes/admin.js"; 
import userRoutes from "./routes/user.js"; 
import authRoutes from "./routes/auth.js"
import errorHandler from "./middlewares/error.js"; 
import passport from "./config/passport.js"
import attachLocalCounts from "./middlewares/locals.js";


const app = express();
connectDB();

app.set("view engine","ejs");
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
app.use(session({
    secret: process.env.SESSION_SECRET||'zxcvbnm1234567',
    resave: false,
    saveUninitialized: false,
    name: "session",
    cookie: {
       
        
        
        secure: process.env.NODE_ENV === "production", 
        maxAge: 1000 * 60 * 60 * 24 
    }
}))

app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(attachLocalCounts);

app.use("/admin", adminRoutes);
app.use("/", userRoutes);
app.use("/auth", authRoutes);
app.use(errorHandler);
    

app.listen(process.env.PORT ,() => console.log(`Server running on port ${process.env.PORT}`));
