import {
  findAdminByEmail,
  verifyPassword,
  getAdminUser
} from "../../services/adminServices/adminAuthService.js";


const loadLogin = async (req, res) => {

  const adminError = req.session.adminError;
  const formData = req.session.adminFormData || {};

  delete req.session.adminError;
  delete req.session.adminFormData;

  const errors = {};

  if (adminError) {
    errors.general = adminError;
  }

  return res.render("admin/auth/signInPage", { errors, formData });

};


const login = async (req, res) => {

  try {

    const { Email, Password } = req.body;

    if (!Email || !Password) {
      req.session.adminError = "Email and Password are required";
      req.session.adminFormData = { Email, Password };
      return res.redirect("/admin");
    }

    const user = await findAdminByEmail(Email);

    if (!user) {
      req.session.adminError = "Admin account not found";
      return res.redirect("/admin");
    }

    const passwordMatch = await verifyPassword(Password, user.Password);

    if (!passwordMatch) {
      req.session.adminError = "Incorrect Email or Password";
      req.session.adminFormData = { Email };
      return res.redirect("/admin");
    }

    req.session.admin = {
      Email: user.Email,
      Name: user.Name
    };

    req.session.successSwal = "Login Successful";

    return res.redirect("/admin/dashboard");

  } catch (error) {

    console.log("Login Error:", error.message);
    res.status(500).send("Server Error");

  }

};


const dashboard = async (req, res) => {

  try {

    const user = await getAdminUser();

    const successSwal = req.session.successSwal;
    delete req.session.successSwal;

    return res.render("admin/home/dashboard", { user, successSwal });

  } catch (error) {

    console.log("Dashboard Error:", error.message);
    res.status(500).send("Server Error");

  }

};


const logout = (req, res) => {

 delete req.session.admin;
  res.redirect('/admin')
};


export { loadLogin, login, dashboard, logout };