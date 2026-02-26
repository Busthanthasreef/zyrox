# 🛡️ Zyrox Authentication Middleware - Quick Reference

## Available Middleware Functions

### 1. `isUserAuthenticated`
**Purpose:** Protect routes that require user login  
**Redirects to:** `/signin` if not logged in

**Usage:**
```javascript
import { isUserAuthenticated } from "../middlewares/auth.js";

userRoutes.get("/profile", isUserAuthenticated, controller.userProfile);
userRoutes.get("/orders", isUserAuthenticated, controller.getOrders);
userRoutes.post("/checkout", isUserAuthenticated, controller.checkout);
```

---

### 2. `isUserGuest`
**Purpose:** Prevent logged-in users from accessing auth pages  
**Redirects to:** `/` (home) if already logged in

**Usage:**
```javascript
import { isUserGuest } from "../middlewares/auth.js";

userRoutes.get("/signin", isUserGuest, controller.loadSignIn);
userRoutes.get("/signup", isUserGuest, controller.loadSignUp);
userRoutes.get("/forgot-password", isUserGuest, controller.forgotPassword);
```

---

### 3. `isAdminAuthenticated`
**Purpose:** Protect admin routes  
**Redirects to:** `/admin` if not logged in as admin

**Usage:**
```javascript
import { isAdminAuthenticated } from "../middlewares/auth.js";

adminRoutes.get("/dashboard", isAdminAuthenticated, controller.dashboard);
adminRoutes.get("/users", isAdminAuthenticated, controller.listUsers);
```

---

### 4. `isAdminGuest`
**Purpose:** Prevent logged-in admins from accessing admin login  
**Redirects to:** `/admin/dashboard` if already logged in

**Usage:**
```javascript
import { isAdminGuest } from "../middlewares/auth.js";

adminRoutes.get("/", isAdminGuest, controller.loadLogin);
```

---

## Common Patterns

### Protected User Route
```javascript
userRoutes.get("/my-account", isUserAuthenticated, (req, res) => {
  // req.session.user is guaranteed to exist here
  res.render("account", { user: req.session.user });
});
```

### Public Route (No Middleware)
```javascript
userRoutes.get("/", (req, res) => {
  // Anyone can access
  res.render("home", { user: req.session.user || null });
});
```

### Auth Page (Guest Only)
```javascript
userRoutes.get("/login", isUserGuest, (req, res) => {
  // Only accessible if NOT logged in
  res.render("login");
});
```

---

## Session Data Structure

### User Session
```javascript
req.session.user = {
  _id: "user_mongodb_id",
  Name: "User Name",
  Email: "user@example.com"
}
```

### Admin Session (Future)
```javascript
req.session.admin = {
  _id: "admin_mongodb_id",
  Name: "Admin Name",
  Email: "admin@example.com"
}
```

---

## Quick Decision Tree

**Need to protect a route?**
- User route → Use `isUserAuthenticated`
- Admin route → Use `isAdminAuthenticated`

**Need to block logged-in users?**
- User auth pages → Use `isUserGuest`
- Admin login page → Use `isAdminGuest`

**Public route?**
- Don't use any middleware
- Check `req.session.user` manually if needed
