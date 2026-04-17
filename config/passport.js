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

        user = await userSchema.findOne({ Email: profile.emails[0].value });

        if (user) {
          if (!user.isActive) {
            return done(null, false, { message: "blocked" });
          }
          user.googleId = profile.id;
          await user.save();
          return done(null, user);
        }

        user = await userSchema.create({
          Name: profile.displayName,
          Email: profile.emails[0].value,
          googleId: profile.id,
          Profile_image: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : undefined,
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
