const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { oauthService } = require("../services/authService");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${BACKEND_URL}/api/auth/google/callback`,
      scope: ["profile", "email"],
    },
    async function verify(accessToken, refreshToken, profile, done) {
      try {
        const email = profile.emails?.[0]?.value;
        const avatar = profile.photos?.[0]?.value ?? null;

        if (!email) {
          return done(new Error("No email returned from Google"));
        }

        const result = await oauthService({
          email,
          name: profile.displayName,
          googleId: profile.id,
          avatar,
        });

        return done(null, result);
      } catch (err) {
        return done(err);
      }
    }
  )
);

module.exports = passport;
