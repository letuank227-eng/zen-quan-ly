import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

function getDatabaseUrl(): string | undefined {
  // On Vercel serverless environment, /var/task is read-only; copy SQLite dev.db to writable /tmp/dev.db
  if (process.env.VERCEL) {
    const tmpDbPath = '/tmp/dev.db';
    if (!fs.existsSync(tmpDbPath)) {
      const candidatePaths = [
        path.join(__dirname, '../../prisma/dev.db'),
        path.join(process.cwd(), 'server/prisma/dev.db'),
        path.join(process.cwd(), 'prisma/dev.db'),
      ];
      for (const src of candidatePaths) {
        if (fs.existsSync(src)) {
          try {
            fs.copyFileSync(src, tmpDbPath);
            break;
          } catch {}
        }
      }
    }
    return `file:${tmpDbPath}`;
  }
  return process.env.DATABASE_URL;
}

const dbUrl = getDatabaseUrl();

const prisma = new PrismaClient({
  ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export default prisma;
