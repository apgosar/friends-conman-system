const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const res = await prisma.project.updateMany({
    data: { companyName: 'PARADIGM FRIENDS REALTORS LLP' }
  });
  console.log('Updated projects:', res.count);
}
run().finally(() => prisma.$disconnect());
