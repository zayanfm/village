import { PrismaClient } from '@prisma/client';

// Single Prisma client for the service. In real RBAC enforcement you'd open a
// transaction per request and `SET LOCAL app.user_id = '<sub>'` so Row-Level
// Security policies scope every query to the caller.
export const prisma = new PrismaClient();
