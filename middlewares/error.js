const renderErrorPage = (req, res, statusCode = 404) => {
  const user = req.session.user || null;
  const admin = req.session.admin || null;
  const isAdminPath = req.originalUrl.startsWith("/admin");

  res.status(statusCode).render("error/404", { user, admin, isAdminPath });
};

const notFoundHandler = (req, res, next) => {
  renderErrorPage(req, res, 404);
};

const errorHandler = (err, req, res, next) => {
  console.error("Unhandled error:", err);
  renderErrorPage(req, res, 500);
};

export { notFoundHandler, errorHandler };