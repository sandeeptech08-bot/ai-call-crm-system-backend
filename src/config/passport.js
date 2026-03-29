const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { oauthService } = require("../services/authService");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
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
