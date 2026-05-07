import {
  findAdminByEmail,
  verifyPassword,
  getAdminUser,
  validateLoginInput,
  getDashboardStats,
  getChartData,
  getRecentSales,
  getTopProducts,
  getTopCategories,
  getOrderStatusData,
  getPaymentData
} from "../../services/adminServices/adminAuthService.js";


// ─── Load Login Page ──────────────────────────────────────────────────────────

const loadLogin = async (req, res) => {
  const adminError = req.session.adminError;
  const formData = req.session.adminFormData || {};

  delete req.session.adminError;
  delete req.session.adminFormData;

  const errors = adminError ? { general: adminError } : {};

  return res.render("admin/auth/signInPage", { errors, formData });
};


// ─── Login ────────────────────────────────────────────────────────────────────

const login = async (req, res) => {
  try {
    const Email = req.body.email || req.body.Email;
    const Password = req.body.password || req.body.Password;

    // Delegate validation to service
    const { valid, error } = validateLoginInput(Email, Password);
    if (!valid) {
      req.session.adminError = error;
      req.session.adminFormData = { email: Email };
      return res.redirect("/adminUser");
    }

    // Delegate DB lookup & password check to service
    const user = await findAdminByEmail(Email);
    if (!user) {
      req.session.adminError = "Admin account not found";
      req.session.adminFormData = { email: Email };
      return res.redirect("/adminUser");
    }

    const passwordMatch = await verifyPassword(Password, user.Password);
    if (!passwordMatch) {
      req.session.adminError = "Incorrect Email or Password";
      req.session.adminFormData = { email: Email };
      return res.redirect("/adminUser");
    }

    req.session.admin = { Email: user.Email, Name: user.Name };
    req.session.successSwal = "Login Successful";

    return res.redirect("/adminUser/dashboard");

  } catch (error) {
    console.log("Login Error:", error.message);
    res.status(500).send("Server Error");
  }
};


// ─── Dashboard ────────────────────────────────────────────────────────────────

const dashboard = async (req, res) => {
  try {
    const filter = req.query.filter || "monthly";

    const successSwal = req.session.successSwal;
    delete req.session.successSwal;

    // All heavy lifting delegated to the service layer
    const [
      user,
      stats,
      { chartLabels, chartData, chartTitle },
      recentSales,
      topProducts,
      topCategories,
      orderStatusData,
      paymentData
    ] = await Promise.all([
      getAdminUser(),
      getDashboardStats(),
      getChartData(filter),
      getRecentSales(),
      getTopProducts(),
      getTopCategories(),
      getOrderStatusData(),
      getPaymentData()
    ]);

    return res.render("admin/home/dashboard", {
      user,
      successSwal,
      stats,
      chartLabels,
      chartData,
      chartTitle,
      filter,
      recentSales,
      topProducts,
      topCategories,
      orderStatusData,
      paymentData
    });

  } catch (error) {
    console.log("Dashboard Error:", error.message);
    res.status(500).send("Server Error");
  }
};


// ─── Logout ───────────────────────────────────────────────────────────────────

const logout = (req, res) => {
  delete req.session.admin;
  res.redirect("/adminUser");
};


export { loadLogin, login, dashboard, logout };