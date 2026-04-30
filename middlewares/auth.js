import userSchema from ".././models/user.js"

// Admin authentication middleware
const isAdminAuthenticated = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect("/admin");
  }
  next();
};


const isUserBlocked = async (req, res, next) => {
  if (req.session.user) {
    const user = await userSchema.findOne({ _id: req.session.user._id, isActive: false })
    if (user) {
      delete req.session.user
      return res.redirect('/')
    }
  }
  next();
}

// Check if admin is already logged in
const isAdminGuest = (req, res, next) => {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  next();
};





// User authentication middleware
const isUserAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json')) || req.path.startsWith('/cart/') || req.path.startsWith('/wishlist/')) {
      // Save the Referer so the user returns to the referring page (like product details) after login
      req.session.returnTo = req.get('Referer') || '/';
      return res.status(401).json({ success: false, requiresAuth: true, redirect: '/signin', message: 'Please sign in' });
    } else {
      // For standard page requests, save the URL they tried to visit
      req.session.returnTo = req.originalUrl || '/';
      return res.redirect("/signin");
    }
  }
  next();
};




// Check if user is already logged in (for login/signup pages)
const isUserGuest = (req, res, next) => {
  if (req.session.user) {
    return res.redirect("/");
  }
  next();
};


export { 
  isUserAuthenticated, 
  isAdminAuthenticated,
  isUserGuest,
  isUserBlocked,
  isAdminGuest
};