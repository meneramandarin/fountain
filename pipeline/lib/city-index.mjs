import { query as defaultQuery, withTransaction as defaultWithTransaction } from "./db.mjs";

export async function inspectCityIndex({ schema = "fountain" } = {}, operations = {}) {
  const query = operations.query || defaultQuery;
  const normalizedSchema = normalizeIdentifier(schema);
  const result = await query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(normalizedSchema)}.city_index`);
  return { schema: normalizedSchema, count: Number(result.rows[0]?.count || 0) };
}

export async function refreshCityIndex({ schema = "fountain" } = {}, operations = {}) {
  const withTransaction = operations.withTransaction || defaultWithTransaction;
  const normalizedSchema = normalizeIdentifier(schema);
  return withTransaction(async (client) => {
    await client.query(`SELECT ${quoteIdent(normalizedSchema)}.refresh_city_index()`);
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdent(normalizedSchema)}.city_index`,
    );
    return { schema: normalizedSchema, count: Number(result.rows[0]?.count || 0) };
  });
}

export function normalizeIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ""))) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
  return String(value);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
