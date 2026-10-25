export function reportStartupError(context: string, error: unknown): void {
  const details: string[] = [];
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    // Driver messages and Drizzle query errors can include credentials or SQL values.
    if (
      cause.message === 'DATABASE_URL is required.' ||
      cause.message === 'JWT_SECRET must have at least 32 characters' ||
      cause.message === "Can't find meta/_journal.json file"
    ) {
      details.push(cause.message);
    }
    if ('code' in cause && typeof cause.code === 'string' && /^[A-Z0-9_]{5,32}$/.test(cause.code)) {
      details.push(`code ${cause.code}`);
    }
  }
  console.error(
    `${context}${details.length ? `: ${details.join('; ')}` : '.'} Check DATABASE_URL, database permissions, JWT_SECRET, and packaged drizzle migration files.`,
  );
}
