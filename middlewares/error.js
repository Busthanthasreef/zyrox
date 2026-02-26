
const errorHandler = (req, res, next) => {
  const user= req.session.user || null;
  const admin=req.session.admin || null;

  res.status(404).render("error/404",{user,admin});
};

export default errorHandler;