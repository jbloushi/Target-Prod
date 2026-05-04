export const ROLE_LABELS = {
  admin: 'Platform Admin',
  staff: 'Platform Staff',
  driver: 'Driver',
  accounting: 'Accounting',
  manager: 'Manager',
  org_manager: 'Company Manager',
  org_agent: 'Company Client',
  client: 'Company Client'
};

export const getRoleLabel = (role) => ROLE_LABELS[role] || role || 'Unknown';
