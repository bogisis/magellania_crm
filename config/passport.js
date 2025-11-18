/**
 * Passport.js Configuration
 * Local Strategy for email/password authentication
 */

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const logger = require('../utils/logger');

/**
 * Configure Passport authentication
 *
 * @param {AuthService} authService - Authentication service instance
 */
function configurePassport(authService) {
    // ========================================================================
    // Local Strategy (Email + Password)
    // ========================================================================

    passport.use(new LocalStrategy({
        usernameField: 'email',  // Use email instead of username
        passwordField: 'password',
        passReqToCallback: true  // Pass request to callback for metadata
    }, async (req, email, password, done) => {
        try {
            // Extract metadata for logging
            const metadata = {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent')
            };

            // Authenticate user
            const user = await authService.login(email, password, metadata);

            // Success
            return done(null, user);
        } catch (error) {
            // Authentication failed
            logger.warn('Authentication failed', {
                email,
                error: error.message
            });

            return done(null, false, { message: error.message });
        }
    }));

    // ========================================================================
    // Serialize User (store in session)
    // ========================================================================

    passport.serializeUser((user, done) => {
        // Store only user ID in session
        done(null, user.id);
    });

    // ========================================================================
    // Deserialize User (retrieve from session)
    // ========================================================================

    passport.deserializeUser((id, done) => {
        try {
            // Retrieve full user object from database
            const user = authService.getUserById(id);

            if (!user) {
                return done(new Error('User not found'));
            }

            done(null, user);
        } catch (error) {
            logger.logError(error, { context: 'Deserialize user', userId: id });
            done(error);
        }
    });

    logger.info('Passport configured successfully');
}

module.exports = configurePassport;
