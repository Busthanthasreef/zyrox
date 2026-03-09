// Admin authentication middleware
const isAdminAuthenticated = (req, res, next) => {
  if (!req.session.admin) {
    return res.redirect("/admin");
  }
  next();
};



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
    // Save the page they were trying to visit so we can redirect back after login
    req.session.returnTo = req.originalUrl;
    return res.redirect("/signin");
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
  isAdminGuest
};