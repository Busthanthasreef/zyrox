const renderErrorPage = (req, res, statusCode = 404) => {
  const user = req.session.user || null;
  const admin = req.session.admin || null;
  const isAdminPath = req.originalUrl.startsWith("/adminUser");

  const viewPath = statusCode === 404 ? "error/404" : "error/500";
  res.status(statusCode).render(viewPath, { user, admin, isAdminPath });
};

const notFoundHandler = (req, res, next) => {
  renderErrorPage(req, res, 404);
};

const errorHandler = (err, req, res, next) => {
  console.error("Unhandled error:", err);
  renderErrorPage(req, res, 500);
};

export { notFoundHandler, errorHandler };