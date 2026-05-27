import postgres from 'postgres';

// Singleton PostgreSQL connection
let sql: ReturnType<typeof postgres> | null = null;

export function getDB() {
  if (!sql) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    sql = postgres(databaseUrl, {
      max: 50, // Connection pool size
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: 'require',
      prepare: false, // Required for Supabase pooler (transaction mode)
    });
  }

  return sql;
}

// Helper to close connection (useful for scripts)
export async function closeDB() {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

// Transaction helper
export async function withTransaction<T>(
  callback: (tx: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  const db = getDB();
  return db.begin(callback) as Promise<T>;
}
