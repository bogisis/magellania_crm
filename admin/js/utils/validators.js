/**
 * Form Validation Utilities
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * Reusable validation functions for forms
 */

import { config } from '../config.js';

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean}
 */
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= config.validation.maxEmailLength;
}

/**
 * Validate password strength
 * @param {string} password - Password
 * @returns {Object} Validation result with strength indicator
 */
export function validatePassword(password) {
    const result = {
        isValid: true,
        strength: 'weak',
        errors: []
    };

    if (!password) {
        result.isValid = false;
        result.errors.push('Password is required');
        return result;
    }

    const minLength = config.validation.minPasswordLength;
    const maxLength = config.validation.maxPasswordLength;

    if (password.length < minLength) {
        result.isValid = false;
        result.errors.push(`Password must be at least ${minLength} characters`);
        return result;
    }

    if (password.length > maxLength) {
        result.isValid = false;
        result.errors.push(`Password must not exceed ${maxLength} characters`);
        return result;
    }

    // Calculate strength
    let strength = 0;

    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    if (strength >= 4) {
        result.strength = 'strong';
    } else if (strength >= 3) {
        result.strength = 'medium';
    } else {
        result.strength = 'weak';
    }

    return result;
}

/**
 * Validate username
 * @param {string} username - Username
 * @returns {Object} Validation result
 */
export function validateUsername(username) {
    const result = {
        isValid: true,
        errors: []
    };

    if (!username) {
        result.isValid = false;
        result.errors.push('Username is required');
        return result;
    }

    if (username.length > config.validation.maxUsernameLength) {
        result.isValid = false;
        result.errors.push(`Username must not exceed ${config.validation.maxUsernameLength} characters`);
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        result.isValid = false;
        result.errors.push('Username can only contain letters, numbers, underscores, and hyphens');
    }

    return result;
}

/**
 * Validate required field
 * @param {*} value - Field value
 * @param {string} fieldName - Field name for error message
 * @returns {Object} Validation result
 */
export function validateRequired(value, fieldName = 'This field') {
    const result = {
        isValid: true,
        errors: []
    };

    if (value === null || value === undefined || value === '') {
        result.isValid = false;
        result.errors.push(`${fieldName} is required`);
    }

    return result;
}

/**
 * Validate string length
 * @param {string} value - String value
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @param {string} fieldName - Field name for error message
 * @returns {Object} Validation result
 */
export function validateLength(value, min, max, fieldName = 'This field') {
    const result = {
        isValid: true,
        errors: []
    };

    if (!value || typeof value !== 'string') {
        result.isValid = false;
        result.errors.push(`${fieldName} must be a string`);
        return result;
    }

    if (value.length < min) {
        result.isValid = false;
        result.errors.push(`${fieldName} must be at least ${min} characters`);
    }

    if (value.length > max) {
        result.isValid = false;
        result.errors.push(`${fieldName} must not exceed ${max} characters`);
    }

    return result;
}

/**
 * Validate number range
 * @param {number} value - Number value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} fieldName - Field name for error message
 * @returns {Object} Validation result
 */
export function validateRange(value, min, max, fieldName = 'This field') {
    const result = {
        isValid: true,
        errors: []
    };

    const num = parseFloat(value);

    if (isNaN(num)) {
        result.isValid = false;
        result.errors.push(`${fieldName} must be a number`);
        return result;
    }

    if (num < min) {
        result.isValid = false;
        result.errors.push(`${fieldName} must be at least ${min}`);
    }

    if (num > max) {
        result.isValid = false;
        result.errors.push(`${fieldName} must not exceed ${max}`);
    }

    return result;
}

/**
 * Validate form data
 * @param {Object} data - Form data
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result with field-specific errors
 */
export function validateForm(data, rules) {
    const result = {
        isValid: true,
        errors: {},
        fieldErrors: {}
    };

    for (const [field, fieldRules] of Object.entries(rules)) {
        const value = data[field];
        const fieldErrors = [];

        for (const rule of fieldRules) {
            let validationResult;

            switch (rule.type) {
                case 'required':
                    validationResult = validateRequired(value, rule.label || field);
                    break;

                case 'email':
                    if (value && !isValidEmail(value)) {
                        fieldErrors.push(rule.message || 'Invalid email format');
                    }
                    break;

                case 'password':
                    validationResult = validatePassword(value);
                    break;

                case 'username':
                    validationResult = validateUsername(value);
                    break;

                case 'length':
                    validationResult = validateLength(
                        value,
                        rule.min || 0,
                        rule.max || Infinity,
                        rule.label || field
                    );
                    break;

                case 'range':
                    validationResult = validateRange(
                        value,
                        rule.min || -Infinity,
                        rule.max || Infinity,
                        rule.label || field
                    );
                    break;

                case 'custom':
                    if (rule.validator && typeof rule.validator === 'function') {
                        const customResult = rule.validator(value, data);
                        if (!customResult.isValid) {
                            fieldErrors.push(...customResult.errors);
                        }
                    }
                    break;

                default:
                    console.warn(`Unknown validation rule type: ${rule.type}`);
            }

            if (validationResult && !validationResult.isValid) {
                fieldErrors.push(...validationResult.errors);
            }
        }

        if (fieldErrors.length > 0) {
            result.isValid = false;
            result.fieldErrors[field] = fieldErrors;
        }
    }

    return result;
}

/**
 * Display validation errors on form
 * @param {HTMLFormElement} form - Form element
 * @param {Object} fieldErrors - Field-specific errors
 */
export function displayFormErrors(form, fieldErrors) {
    // Clear previous errors
    const errorElements = form.querySelectorAll('.form-error');
    errorElements.forEach(el => el.remove());

    const invalidInputs = form.querySelectorAll('.is-invalid');
    invalidInputs.forEach(el => el.classList.remove('is-invalid'));

    // Display new errors
    for (const [field, errors] of Object.entries(fieldErrors)) {
        const input = form.querySelector(`[name="${field}"]`);

        if (input) {
            input.classList.add('is-invalid');

            const errorDiv = document.createElement('div');
            errorDiv.className = 'form-error';
            errorDiv.textContent = errors[0]; // Show first error only

            input.parentElement.appendChild(errorDiv);
        }
    }
}

/**
 * Clear form errors
 * @param {HTMLFormElement} form - Form element
 */
export function clearFormErrors(form) {
    const errorElements = form.querySelectorAll('.form-error');
    errorElements.forEach(el => el.remove());

    const invalidInputs = form.querySelectorAll('.is-invalid');
    invalidInputs.forEach(el => el.classList.remove('is-invalid'));
}
