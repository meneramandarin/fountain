import pg from "pg";

const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL or POSTGRES_URL is required");
}

const pool = new pg.Pool({ connectionString });
const client = await pool.connect();
let treatments;
try {
  await client.query("SET search_path TO fountain, public");
  const result = await client.query(`
    WITH covered_locations AS (
      SELECT o.treatment_id, l.id
      FROM offerings o
      JOIN locations l
        ON l.id = o.location_id
        AND l.status = 'active'
        AND l.deleted_at IS NULL
        AND COALESCE(l.is_virtual, false) = false
      JOIN city_index ci
        ON lower(trim(ci.city)) = lower(trim(l.locality))
        AND ci.country_code = l.country_code
      WHERE o.status = 'active'
        AND o.deleted_at IS NULL
        AND trim(ci.city) <> ''
        AND position(',' in ci.city) = 0
        AND ci.city !~* '\\m(virtual|various|unknown)\\M'
      GROUP BY o.treatment_id, l.id
    )
    SELECT
      t.canonical_name AS treatment,
      COUNT(covered_locations.id)::int AS db_count
    FROM treatments t
    LEFT JOIN covered_locations ON covered_locations.treatment_id = t.id
    GROUP BY t.id, t.canonical_name
    ORDER BY lower(t.canonical_name)
  `);
  treatments = result.rows;
} finally {
  client.release();
  await pool.end();
}

const rows = await mapWithConcurrency(treatments, 8, async ({ treatment, db_count: dbCount }) => {
  const url = `${baseUrl}/treatments/${slug(treatment)}`;
  const response = await fetch(url);
  const html = await response.text();
  const match = html.match(/<meta name="description" content="([0-9,]+) locations across ([0-9,]+) cities\."/);
  const renderedCount = match ? Number(match[1].replaceAll(",", "")) : null;
  return { treatment, dbCount: Number(dbCount), renderedCount, status: response.status };
});

console.log("| Treatment | DB offering count | Page-rendered count |");
console.log("|---|---:|---:|");
for (const row of rows) {
  console.log(`| ${escapeTable(row.treatment)} | ${row.dbCount} | ${row.renderedCount ?? `HTTP ${row.status}`} |`);
}

const mismatches = rows.filter((row) => row.status !== 200 || row.renderedCount !== row.dbCount);
console.log(`\nVerified ${rows.length} treatments; mismatches: ${mismatches.length}.`);
if (mismatches.length) {
  process.exitCode = 1;
}

function slug(value) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeTable(value) {
  return value.replaceAll("|", "\\|");
}

async function mapWithConcurrency(values, limit, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await mapper(values[index]);
    }
  }));
  return output;
}
