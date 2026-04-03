
const errorHandler = (req, res, next) => {
  const user = req.session.user || null;
  const admin = req.session.admin || null;
  const isAdminPath = req.originalUrl.startsWith("/admin");

  res.status(404).render("error/404", { user, admin, isAdminPath });
};

export default errorHandler;