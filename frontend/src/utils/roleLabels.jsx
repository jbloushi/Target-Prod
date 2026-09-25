export const ROLE_LABELS = {
  admin: 'Superadmin',
  manager: 'Target Owner',
  accounting: 'Target Accounting',
  staff: 'Target Ops Staff',
  driver: 'Courier Driver',
  org_manager: 'Company Manager',
  org_agent: 'Company Client',
  client: 'Company Client'
};

export const getRoleLabel = (role) => ROLE_LABELS[role] || role || 'Unknown';
