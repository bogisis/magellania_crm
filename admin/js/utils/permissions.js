/**
 * Permission Management Utilities
 * Version: 1.0.0
 * Created: 2025-12-14
 *
 * Client-side permission checks and helpers
 */

import { config } from '../config.js';

/**
 * Check if user has required role level
 * @param {string} userRole - User's role
 * @param {string} requiredRole - Required role
 * @returns {boolean}
 */
export function hasRoleLevel(userRole, requiredRole) {
    const userLevel = config.roles[userRole]?.level || 0;
    const requiredLevel = config.roles[requiredRole]?.level || 0;
    return userLevel >= requiredLevel;
}

/**
 * Check if user is superadmin
 * @param {Object} user - User object
 * @returns {boolean}
 */
export function isSuperadmin(user) {
    return user && user.role === 'superadmin';
}

/**
 * Check if user is admin or higher
 * @param {Object} user - User object
 * @returns {boolean}
 */
export function isAdmin(user) {
    return user && (user.role === 'admin' || user.role === 'superadmin');
}

/**
 * Check if user can manage organizations
 * @param {Object} user - User object
 * @returns {boolean}
 */
export function canManageOrganizations(user) {
    return isSuperadmin(user);
}

/**
 * Check if user can manage users
 * @param {Object} user - User object
 * @param {Object} targetUser - Target user to manage (optional)
 * @returns {boolean}
 */
export function canManageUsers(user, targetUser = null) {
    if (!user) return false;

    // Superadmin can manage all users
    if (isSuperadmin(user)) {
        return true;
    }

    // Admin can manage users in their organization
    if (isAdmin(user)) {
        // Cannot manage other admins or superadmins
        if (targetUser && (targetUser.role === 'admin' || targetUser.role === 'superadmin')) {
            return false;
        }

        // Can only manage users in same organization
        if (targetUser && targetUser.organization_id !== user.organization_id) {
            return false;
        }

        return true;
    }

    return false;
}

/**
 * Check if user can edit specific user
 * @param {Object} user - Current user
 * @param {Object} targetUser - User to edit
 * @returns {boolean}
 */
export function canEditUser(user, targetUser) {
    if (!user || !targetUser) return false;

    // User can edit their own profile
    if (user.id === targetUser.id) {
        return true;
    }

    // Check if user can manage the target user
    return canManageUsers(user, targetUser);
}

/**
 * Check if user can delete specific user
 * @param {Object} user - Current user
 * @param {Object} targetUser - User to delete
 * @returns {boolean}
 */
export function canDeleteUser(user, targetUser) {
    if (!user || !targetUser) return false;

    // Cannot delete yourself
    if (user.id === targetUser.id) {
        return false;
    }

    // Check if user can manage the target user
    return canManageUsers(user, targetUser);
}

/**
 * Check if user can reset password for specific user
 * @param {Object} user - Current user
 * @param {Object} targetUser - User whose password to reset
 * @returns {boolean}
 */
export function canResetPassword(user, targetUser) {
    if (!user || !targetUser) return false;

    // Superadmin can reset any password
    if (isSuperadmin(user)) {
        return true;
    }

    // Admin can reset passwords in their organization (except other admins)
    if (isAdmin(user)) {
        if (targetUser.role === 'admin' || targetUser.role === 'superadmin') {
            return false;
        }

        if (targetUser.organization_id !== user.organization_id) {
            return false;
        }

        return true;
    }

    return false;
}

/**
 * Check if user can view audit logs
 * @param {Object} user - User object
 * @returns {boolean}
 */
export function canViewAuditLog(user) {
    return isAdmin(user);
}

/**
 * Get allowed actions for a user on a target resource
 * @param {Object} user - Current user
 * @param {string} resourceType - Type of resource ('user', 'organization', etc.)
 * @param {Object} resource - Resource object (optional)
 * @returns {Object} Object with allowed action flags
 */
export function getAllowedActions(user, resourceType, resource = null) {
    const actions = {
        view: false,
        create: false,
        edit: false,
        delete: false,
        manage: false
    };

    if (!user) return actions;

    switch (resourceType) {
        case 'user':
            actions.view = isAdmin(user);
            actions.create = isAdmin(user);
            actions.edit = resource ? canEditUser(user, resource) : canManageUsers(user);
            actions.delete = resource ? canDeleteUser(user, resource) : canManageUsers(user);
            actions.manage = canManageUsers(user, resource);
            break;

        case 'organization':
            actions.view = isSuperadmin(user);
            actions.create = isSuperadmin(user);
            actions.edit = isSuperadmin(user);
            actions.delete = isSuperadmin(user);
            actions.manage = isSuperadmin(user);
            break;

        case 'audit-log':
            actions.view = canViewAuditLog(user);
            break;

        case 'settings':
            actions.view = isAdmin(user);
            actions.edit = isAdmin(user);
            break;

        default:
            console.warn(`Unknown resource type: ${resourceType}`);
    }

    return actions;
}

/**
 * Filter menu items based on user permissions
 * @param {Object} user - User object
 * @param {Array} menuItems - Array of menu items
 * @returns {Array} Filtered menu items
 */
export function filterMenuByPermissions(user, menuItems) {
    if (!user) return [];

    return menuItems.filter(item => {
        // Check if item has permission requirement
        if (item.requiresRole) {
            return hasRoleLevel(user.role, item.requiresRole);
        }

        if (item.requiresPermission) {
            // Custom permission check
            switch (item.requiresPermission) {
                case 'manage_organizations':
                    return canManageOrganizations(user);
                case 'manage_users':
                    return canManageUsers(user);
                case 'view_audit_log':
                    return canViewAuditLog(user);
                default:
                    return true;
            }
        }

        // No permission requirement - show to everyone
        return true;
    });
}

/**
 * Show/hide UI elements based on permissions
 * @param {Object} user - User object
 * @param {string} selector - CSS selector
 * @param {Function} permissionCheck - Permission check function
 */
export function toggleElementByPermission(user, selector, permissionCheck) {
    const elements = document.querySelectorAll(selector);

    elements.forEach(element => {
        if (permissionCheck(user)) {
            element.style.display = '';
            element.removeAttribute('disabled');
        } else {
            element.style.display = 'none';
            element.setAttribute('disabled', 'disabled');
        }
    });
}

/**
 * Disable UI elements based on permissions
 * @param {Object} user - User object
 * @param {string} selector - CSS selector
 * @param {Function} permissionCheck - Permission check function
 */
export function disableElementByPermission(user, selector, permissionCheck) {
    const elements = document.querySelectorAll(selector);

    elements.forEach(element => {
        if (!permissionCheck(user)) {
            element.setAttribute('disabled', 'disabled');
            element.classList.add('disabled');
        } else {
            element.removeAttribute('disabled');
            element.classList.remove('disabled');
        }
    });
}
