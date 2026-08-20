import {
  deactivateAdminUser, inviteAdminUser, listAdminUsers, updateAdminUser,
} from '../../services/adminUserService.js';
import { createClientRequestId } from '../write/writeCommand.js';

export const loadAdminUsers = organizationId => listAdminUsers(organizationId);
export const commitAdminUser = (organizationId, input) =>
  updateAdminUser(organizationId, input, createClientRequestId());
export const removeAdminUser = (organizationId, input) =>
  deactivateAdminUser(organizationId, input, createClientRequestId());
export const sendAdminUserInvitation = (organizationId, input) =>
  inviteAdminUser(organizationId, input, createClientRequestId());
