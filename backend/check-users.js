const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, role: true }
        });
        console.log('Users in DB:');
        console.log(JSON.stringify(users, null, 2));
    } catch (e) {
        console.error('Prisma Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkUsers();
