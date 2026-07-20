import { Prisma } from '@prisma/client';

/**
 * True for Prisma's unique-constraint-violation error (P2002). Used to
 * turn a lost race on a pre-check-then-create pattern into a clean 409
 * instead of an unhandled 500.
 */
export function isUniqueConstraintViolation(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
