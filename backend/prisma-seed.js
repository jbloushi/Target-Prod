const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seed() {
  console.log('Connecting to Prisma database...');
  await prisma.$connect();

  console.log('Creating internal organization...');
  const org = await prisma.organization.create({
    data: {
      name: 'Internal Logistics Org',
      type: 'internal',
      currency: 'KWD',
    }
  });

  console.log('Creating admin user...');
  const hashedPassword = await bcrypt.hash('password123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@demo.com',
      password: hashedPassword,
      role: 'admin',
      organizationId: org.id
    }
  });

  console.log('✅ Created Admin user: admin@demo.com / password123');
  await prisma.$disconnect();
}

seed().catch(e => {
  console.error('Seeding failed:', e);
  process.exit(1);
});
