import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import userSchema from "../models/user.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:2999/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await userSchema.findOne({ googleId: profile.id });

        if (user) {
          if (!user.isActive) {
            return done(null, false, { message: "blocked" });
          }
          return done(null, user);
        }

        const googlePhoto = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;

        user = await userSchema.findOne({ Email: profile.emails[0].value });

        if (user) {
          if (!user.isActive) {
            return done(null, false, { message: "blocked" });
          }
          // Link Google ID if not present
          let modified = false;
          if (!user.googleId) {
            user.googleId = profile.id;
            modified = true;
          }
          // If user has no profile image or has the default one, update it with Google photo
          if (googlePhoto && (!user.Profile_image || user.Profile_image === "/images/default-avatar.png")) {
            user.Profile_image = googlePhoto;
            modified = true;
          }

          if (modified) await user.save();
          return done(null, user);
        }

        user = await userSchema.create({
          Name: profile.displayName,
          Email: profile.emails[0].value,
          googleId: profile.id,
          Profile_image: googlePhoto || "/images/default-avatar.png",
          isAdmin: false,
          isActive: true,
          createdAt: new Date(),
        });

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);


// Session handling
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await userSchema.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
