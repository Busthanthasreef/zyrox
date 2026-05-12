import express from "express";
import passport from "passport";

const router = express.Router();

router.get("/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get("/google/callback", (req, res, next) => {
  passport.authenticate("google", (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      if (info && info.message === "blocked") {
        return res.redirect("/signin?error=blocked");
      }
      return res.redirect("/signin");
    }
    // Preserve admin session across passport's internal session.regenerate()
    const adminSession = req.session.admin;

    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }

      // Restore admin session if it existed before Google OAuth regenerated the session
      if (adminSession) {
        req.session.admin = adminSession;
      }

      req.session.user = {
        _id: req.user._id,
        Name: req.user.Name,
        Email: req.user.Email,
        Profile_image: req.user.Profile_image,
      };
      req.session.save((err) => {
        if (err) {
          console.log("Session save error:", err);
          return res.redirect("/signin");
        }
        console.log(`${req.user.Name} logged in through Google`);
        res.redirect("/?loginSuccess=true");
      });
    });
  })(req, res, next);
});


export default router;
