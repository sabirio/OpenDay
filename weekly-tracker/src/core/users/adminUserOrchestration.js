import { deactivateAdminUser, listAdminUsers, updateAdminUser } from '../../services/adminUserService.js';
import { createClientRequestId } from '../write/writeCommand.js';

export const loadAdminUsers = () => listAdminUsers();
export const commitAdminUser = input => updateAdminUser(input, createClientRequestId());
export const removeAdminUser = userId => deactivateAdminUser(userId, createClientRequestId());
