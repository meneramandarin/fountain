import pg from "pg";

const { Pool } = pg;

let appPool: pg.Pool | null = null;

function appConnectionString() {
  const connectionString =
    process.env.APP_DATABASE_URL || process.env.fountain_user_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "APP_DATABASE_URL or fountain_user_DATABASE_URL is required for private app data.",
    );
  }

  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

function getAppPool() {
  if (!appPool) {
    appPool = new Pool({
      connectionString: appConnectionString(),
      max: Number.parseInt(process.env.APP_POSTGRES_POOL_MAX || "3", 10),
    });
  }

  return appPool;
}

export async function appRows<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
) {
  const result = await getAppPool().query<T>(sql, params);
  return result.rows;
}
