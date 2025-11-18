/**
 * AuthService - Authentication and User Management
 * Handles user registration, login, password management
 *
 * Features:
 * - bcrypt password hashing
 * - Account lockout after failed attempts
 * - Email verification support
 * - Password reset tokens
 * - OAuth ready (Google)
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const logger = require('../utils/logger');

class AuthService {
    constructor(db) {
        if (!db) {
            throw new Error('Database instance is required');
        }
        this.db = db;

        // Security configuration
        this.config = {
            bcryptRounds: 10,  // bcrypt cost factor
            maxFailedAttempts: 5,  // Before account lockout
            lockoutDurationMinutes: 15,  // Account lockout duration
            passwordResetTokenExpiry: 3600,  // 1 hour in seconds
            emailVerificationTokenExpiry: 86400,  // 24 hours in seconds
        };

        this._prepareStatements();
    }

    /**
     * Prepare SQL statements for better performance
     */
    _prepareStatements() {
        this.statements = {
            // User queries
            getUserByEmail: this.db.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL'),
            getUserById: this.db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL'),
            getUserByUsername: this.db.prepare('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL'),
            getUserByGoogleId: this.db.prepare('SELECT * FROM users WHERE google_id = ? AND deleted_at IS NULL'),

            // User mutations
            insertUser: this.db.prepare(`
                INSERT INTO users (
                    id, email, username, password_hash, full_name,
                    oauth_provider, is_active, is_admin, email_verified,
                    organization_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),

            updatePassword: this.db.prepare(`
                UPDATE users
                SET password_hash = ?, updated_at = ?
                WHERE id = ?
            `),

            updateLastLogin: this.db.prepare(`
                UPDATE users
                SET last_login_at = ?, last_login_ip = ?, failed_login_attempts = 0, updated_at = ?
                WHERE id = ?
            `),

            incrementFailedAttempts: this.db.prepare(`
                UPDATE users
                SET failed_login_attempts = failed_login_attempts + 1, updated_at = ?
                WHERE id = ?
            `),

            lockAccount: this.db.prepare(`
                UPDATE users
                SET locked_until = ?, updated_at = ?
                WHERE id = ?
            `),

            verifyEmail: this.db.prepare(`
                UPDATE users
                SET email_verified = 1, email_verification_token = NULL,
                    email_verification_expires = NULL, updated_at = ?
                WHERE id = ?
            `),

            setPasswordResetToken: this.db.prepare(`
                UPDATE users
                SET password_reset_token = ?, password_reset_expires = ?, updated_at = ?
                WHERE id = ?
            `),

            clearPasswordResetToken: this.db.prepare(`
                UPDATE users
                SET password_reset_token = NULL, password_reset_expires = NULL, updated_at = ?
                WHERE id = ?
            `),

            // Auth logs
            insertAuthLog: this.db.prepare(`
                INSERT INTO auth_logs (user_id, action, ip_address, user_agent, success, error_message, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `),

            // Organization queries
            getOrganizationById: this.db.prepare('SELECT * FROM organizations WHERE id = ? AND deleted_at IS NULL'),
        };
    }

    /**
     * Register a new user
     *
     * @param {Object} userData - User registration data
     * @param {string} userData.email - User email
     * @param {string} userData.password - Plain text password
     * @param {string} [userData.username] - Optional username
     * @param {string} [userData.fullName] - Optional full name
     * @param {string} [userData.organizationId] - Organization ID (defaults to 'default-org')
     * @returns {Promise<Object>} Created user (without password hash)
     */
    async register({ email, password, username, fullName, organizationId = 'default-org' }) {
        try {
            // Validation
            if (!email || !password) {
                throw new Error('Email and password are required');
            }

            if (!this._validateEmail(email)) {
                throw new Error('Invalid email format');
            }

            if (!this._validatePassword(password)) {
                throw new Error('Password must be at least 8 characters long');
            }

            // Check if user already exists
            const existingUser = this.statements.getUserByEmail.get(email);
            if (existingUser) {
                throw new Error('User with this email already exists');
            }

            if (username) {
                const existingUsername = this.statements.getUserByUsername.get(username);
                if (existingUsername) {
                    throw new Error('Username already taken');
                }
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, this.config.bcryptRounds);

            // Generate user ID
            const userId = this._generateId();
            const now = Math.floor(Date.now() / 1000);

            // Insert user
            this.statements.insertUser.run(
                userId,
                email.toLowerCase(),
                username || null,
                passwordHash,
                fullName || null,
                'local',  // oauth_provider
                1,  // is_active
                0,  // is_admin
                0,  // email_verified (should verify via email)
                organizationId,
                now,
                now
            );

            // Log registration
            this._logAuthAction(userId, 'register', null, null, true);

            logger.info('User registered successfully', { userId, email });

            // Return user without password hash
            const user = this.statements.getUserById.get(userId);
            return this._sanitizeUser(user);
        } catch (error) {
            logger.logError(error, { context: 'User registration', email });
            throw error;
        }
    }

    /**
     * Authenticate user with email and password
     *
     * @param {string} email - User email
     * @param {string} password - Plain text password
     * @param {Object} [metadata] - Request metadata (IP, user-agent)
     * @returns {Promise<Object>} Authenticated user (without password hash)
     */
    async login(email, password, metadata = {}) {
        const { ipAddress, userAgent } = metadata;

        try {
            if (!email || !password) {
                throw new Error('Email and password are required');
            }

            // Get user
            const user = this.statements.getUserByEmail.get(email.toLowerCase());

            if (!user) {
                this._logAuthAction(null, 'failed_login', ipAddress, userAgent, false, 'User not found');
                throw new Error('Invalid email or password');
            }

            // Check if user is active
            if (!user.is_active) {
                this._logAuthAction(user.id, 'failed_login', ipAddress, userAgent, false, 'Account inactive');
                throw new Error('Account is inactive');
            }

            // Check if account is locked
            if (user.locked_until && user.locked_until > Math.floor(Date.now() / 1000)) {
                const lockedMinutes = Math.ceil((user.locked_until - Math.floor(Date.now() / 1000)) / 60);
                this._logAuthAction(user.id, 'failed_login', ipAddress, userAgent, false, 'Account locked');
                throw new Error(`Account is locked. Try again in ${lockedMinutes} minutes`);
            }

            // Verify password
            const passwordValid = await bcrypt.compare(password, user.password_hash);

            if (!passwordValid) {
                // Increment failed attempts
                const now = Math.floor(Date.now() / 1000);
                this.statements.incrementFailedAttempts.run(now, user.id);

                const newFailedAttempts = user.failed_login_attempts + 1;

                // Lock account if max attempts reached
                if (newFailedAttempts >= this.config.maxFailedAttempts) {
                    const lockUntil = now + (this.config.lockoutDurationMinutes * 60);
                    this.statements.lockAccount.run(lockUntil, now, user.id);

                    this._logAuthAction(user.id, 'account_locked', ipAddress, userAgent, false,
                        `Account locked after ${newFailedAttempts} failed attempts`);

                    throw new Error(`Too many failed login attempts. Account locked for ${this.config.lockoutDurationMinutes} minutes`);
                }

                this._logAuthAction(user.id, 'failed_login', ipAddress, userAgent, false,
                    `Invalid password (attempt ${newFailedAttempts}/${this.config.maxFailedAttempts})`);

                throw new Error('Invalid email or password');
            }

            // Successful login - update last login and reset failed attempts
            const now = Math.floor(Date.now() / 1000);
            this.statements.updateLastLogin.run(now, ipAddress || null, now, user.id);

            this._logAuthAction(user.id, 'login', ipAddress, userAgent, true);

            logger.info('User logged in successfully', { userId: user.id, email });

            // Return user without password hash
            return this._sanitizeUser(user);
        } catch (error) {
            logger.logError(error, { context: 'User login', email });
            throw error;
        }
    }

    /**
     * Get user by ID
     */
    getUserById(userId) {
        const user = this.statements.getUserById.get(userId);
        return user ? this._sanitizeUser(user) : null;
    }

    /**
     * Get user by email
     */
    getUserByEmail(email) {
        const user = this.statements.getUserByEmail.get(email.toLowerCase());
        return user ? this._sanitizeUser(user) : null;
    }

    /**
     * Change user password
     */
    async changePassword(userId, oldPassword, newPassword) {
        try {
            const user = this.statements.getUserById.get(userId);

            if (!user) {
                throw new Error('User not found');
            }

            // Verify old password
            const passwordValid = await bcrypt.compare(oldPassword, user.password_hash);
            if (!passwordValid) {
                throw new Error('Current password is incorrect');
            }

            // Validate new password
            if (!this._validatePassword(newPassword)) {
                throw new Error('New password must be at least 8 characters long');
            }

            // Hash new password
            const passwordHash = await bcrypt.hash(newPassword, this.config.bcryptRounds);
            const now = Math.floor(Date.now() / 1000);

            // Update password
            this.statements.updatePassword.run(passwordHash, now, userId);

            // Clear any password reset tokens
            this.statements.clearPasswordResetToken.run(now, userId);

            this._logAuthAction(userId, 'password_change', null, null, true);

            logger.info('Password changed successfully', { userId });

            return { success: true };
        } catch (error) {
            logger.logError(error, { context: 'Password change', userId });
            throw error;
        }
    }

    /**
     * Verify email
     */
    verifyEmail(userId) {
        const now = Math.floor(Date.now() / 1000);
        this.statements.verifyEmail.run(now, userId);
        this._logAuthAction(userId, 'email_verified', null, null, true);
        logger.info('Email verified', { userId });
        return { success: true };
    }

    /**
     * Remove sensitive data from user object
     */
    _sanitizeUser(user) {
        if (!user) return null;

        const { password_hash, password_salt, password_reset_token,
                email_verification_token, ...sanitized } = user;

        return sanitized;
    }

    /**
     * Log authentication action
     */
    _logAuthAction(userId, action, ipAddress, userAgent, success, errorMessage = null) {
        try {
            const now = Math.floor(Date.now() / 1000);
            this.statements.insertAuthLog.run(
                userId || null,
                action,
                ipAddress || null,
                userAgent || null,
                success ? 1 : 0,
                errorMessage || null,
                now
            );
        } catch (error) {
            logger.warn('Failed to log auth action', { error: error.message });
        }
    }

    /**
     * Validate email format
     */
    _validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate password strength
     */
    _validatePassword(password) {
        return password && password.length >= 8;
    }

    /**
     * Generate UUID v4
     */
    _generateId() {
        return crypto.randomUUID();
    }

    /**
     * Generate secure random token
     */
    _generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Close database connection
     */
    close() {
        // Statements are automatically closed with db
    }
}

module.exports = AuthService;
