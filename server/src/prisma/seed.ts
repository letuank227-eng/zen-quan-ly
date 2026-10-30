import bcrypt from 'bcryptjs';
import prisma from './client';

async function main() {
  console.log('Seeding initial setup for ZEN Social CRM...');

  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@123456', 10);

    const account = await prisma.account.create({
      data: {
        name: 'Doanh nghiệp Mẫu (ZEN CRM)',
      },
    });

    const user = await prisma.user.create({
      data: {
        accountId: account.id,
        email: 'admin@zen.vn',
        password: hashedPassword,
        fullName: 'Quản trị viên',
        phone: '0901234567',
        role: 'ADMIN',
      },
    });

    // Default tags
    const defaultTags = [
      { name: 'Khách mới', color: '#10B981' },
      { name: 'Khách tiềm năng', color: '#3B82F6' },
      { name: 'Đã mua', color: '#059669' },
      { name: 'VIP', color: '#F59E0B' },
      { name: 'Cần chăm sóc', color: '#8B5CF6' },
      { name: 'Khiếu nại', color: '#EF4444' },
    ];

    for (const tag of defaultTags) {
      await prisma.tag.create({
        data: {
          accountId: account.id,
          name: tag.name,
          color: tag.color,
        },
      });
    }

    console.log('Seed completed successfully!');
    console.log('Initial Admin Account:');
    console.log('  Email: admin@zen.vn');
    console.log('  Password: Admin@123456');
    console.log('  Note: No fake Pages are seeded. You must connect real Meta Pages via Meta OAuth.');
  } else {
    console.log('Admin already exists, skipping seed.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
