export const ROLE_LABELS = {
  admin: 'Platform Admin',
  staff: 'Platform Staff',
  client: 'Organization Agent',
  driver: 'Driver',
  accounting: 'Accounting',
  manager: 'Manager',
  org_manager: 'Organization Manager',
  org_agent: 'Organization Agent'
};

export const getRoleLabel = (role) => ROLE_LABELS[role] || role || 'Unknown';
