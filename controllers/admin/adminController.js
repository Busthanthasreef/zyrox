import userSchema from "../../models/user.js";
import bcrypt from "bcryptjs";


const loadLogin = async (req, res) => {
  const adminError = req.session.adminError;
  const formData = req.session.adminFormData || {};


  delete req.session.adminError;
  delete req.session.adminFormData;


  const errors = {};
  if (adminError) {
    errors.general = adminError;
  }

  res.render("admin/auth/signInPage", { errors, formData });
};

const login = async (req, res) => {
  try {
    const { Email, Password } = req.body;

    if (!Email || !Password) {
      req.session.adminError = "Email and Password are required";
      req.session.adminFormData = { Email, Password };
      return res.redirect("/admin");
    }

    const user = await userSchema.findOne({ isAdmin: true });

    if (!user) {
      req.session.adminError = "Admin account not found";
      return res.redirect("/admin");
    }

    const passwordMatch = await bcrypt.compare(Password, user.Password);

    if (Email !== user.Email || !passwordMatch) {
      req.session.adminError = "Incorrect Email or Password";
      req.session.adminFormData = { Email };
      return res.redirect("/admin");
    }

    req.session.admin = true;
    req.session.successSwal = "Login Successful";
    return res.redirect("/admin/dashboard");

  } catch (error) {
    console.log("Login Error:", error.message);
    res.status(500).send("Server Error");
  }
};

const dashboard = async (req, res) => {
  const user = await userSchema.findOne({ isAdmin: true })
  const successSwal = req.session.successSwal;
  delete req.session.successSwal;

  res.render("admin/home/dashboard", { user, successSwal });
}

const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) console.log("Logout Error:", err);
    res.clearCookie("session");
    res.redirect("/admin");
  });

}

export { loadLogin, login, dashboard, logout };
