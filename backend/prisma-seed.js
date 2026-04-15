require('dotenv').config();

const { prisma } = require('./src/config/database');
const { hashPassword } = require('./src/utils/security');

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required in backend/.env before running npm run seed`);
  }
  return value;
};

async function seed() {
  const organizationName = process.env.ADMIN_ORGANIZATION_NAME?.trim() || 'Target Logistics';
  const adminName = process.env.ADMIN_NAME?.trim() || 'System Admin';
  const adminEmail = required('ADMIN_EMAIL').toLowerCase();
  const adminPassword = required('ADMIN_PASSWORD');

  await prisma.$connect();

  const organization = await prisma.organization.upsert({
    where: { name: organizationName },
    update: {
      type: 'internal',
      active: true
    },
    create: {
      name: organizationName,
      type: 'internal',
      currency: 'KWD',
      active: true
    }
  });

  const password = await hashPassword(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      password,
      role: 'admin',
      organizationId: organization.id,
      active: true
    },
    create: {
      name: adminName,
      email: adminEmail,
      password,
      role: 'admin',
      organizationId: organization.id,
      active: true
    }
  });

  console.log(`Seeded admin user: ${admin.email}`);
}

seed()
  .catch((error) => {
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
