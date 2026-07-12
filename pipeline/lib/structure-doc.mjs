import { writeFile as defaultWriteFile } from "node:fs/promises";

import { query as defaultQuery } from "./db.mjs";

export const DEFAULT_SCHEMAS = Object.freeze(["fountain", "fountain_raw", "neon_auth"]);

export async function regenerateStructureDocument({
  outputPath,
  schemas = DEFAULT_SCHEMAS,
  apply = false,
  query = defaultQuery,
  writeFile = defaultWriteFile,
  generatedAt = new Date(),
} = {}) {
  const markdown = await buildStructureDocument({ query, schemas, generatedAt });
  if (apply) {
    if (!outputPath) throw new Error("outputPath is required when applying structure-document regeneration.");
    await writeFile(outputPath, markdown, "utf8");
  }
  return {
    markdown,
    outputPath: apply ? outputPath : null,
    bytes: Buffer.byteLength(markdown),
  };
}

export async function buildStructureDocument({
  query = defaultQuery,
  schemas = DEFAULT_SCHEMAS,
  generatedAt = new Date(),
} = {}) {
  const normalizedSchemas = normalizeSchemas(schemas);
  const rows = createRowsLoader(query);
  const tableCounts = await loadTableCounts(rows, normalizedSchemas);
  const objectSummary = await loadObjectSummary(rows, normalizedSchemas);
  const tableStructures = await loadTableStructures(rows, normalizedSchemas, tableCounts);
  const views = await loadViews(rows, normalizedSchemas);
  const routines = await loadRoutines(rows, normalizedSchemas);
  const extensions = await loadExtensions(rows);

  return `# Neon Database Structure Current

Generated: ${new Date(generatedAt).toISOString()}
Snapshot source: live Neon database

This document is generated from the live Neon database. It records structural metadata and point-in-time row counts for the configured schemas.

## Schema Object Summary

${markdownTable(["schema", "object type", "count"], objectSummary.map((item) => [item.schema, item.object_type, item.count]))}

## Installed Extensions

${markdownTable(["extension", "version", "schema"], extensions.map((item) => [item.extension, item.version, item.schema]))}

## Table Counts

${markdownTable(["schema", "table", "rows"], tableCounts.map((item) => [item.schema, item.table, item.rows]))}

## Tables

${renderTableStructures(tableStructures)}

## Views

${views.length ? views.map(renderView).join("\n\n") : "_None._"}

## Routines

${markdownTable(["schema", "kind", "signature", "returns", "language"], routines.map((item) => [item.schema, item.kind, item.signature, item.returns, item.language]))}
`;
}

async function loadObjectSummary(rows, schemas) {
  return rows(
    `
    WITH objects AS (
      SELECT n.nspname AS schema,
             CASE c.relkind
               WHEN 'r' THEN 'table'
               WHEN 'p' THEN 'partitioned table'
               WHEN 'v' THEN 'view'
               WHEN 'm' THEN 'materialized view'
               WHEN 'S' THEN 'sequence'
               WHEN 'f' THEN 'foreign table'
             END AS object_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname = ANY($1)
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      UNION ALL
      SELECT n.nspname, CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname = ANY($1)
    )
    SELECT schema, object_type, count(*)::integer AS count
    FROM objects
    GROUP BY schema, object_type
    ORDER BY schema, object_type
    `,
    [schemas],
  );
}

async function loadExtensions(rows) {
  return rows(`
    SELECT e.extname AS extension, e.extversion AS version, n.nspname AS schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid=e.extnamespace
    ORDER BY e.extname
  `);
}

async function loadTableStructures(rows, schemas, tableCounts) {
  // Keep catalog queries sequential; a caller may provide a single pg Client.
  const columns = await rows(
    `
    SELECT table_schema AS schema, table_name AS table, ordinal_position AS pos,
           column_name AS column, data_type AS type, udt_name AS udt,
           is_nullable AS nullable, coalesce(column_default, '') AS default
    FROM information_schema.columns
    WHERE table_schema = ANY($1)
    ORDER BY table_schema, table_name, ordinal_position
    `,
    [schemas],
  );
  const constraints = await rows(
    `
    SELECT n.nspname AS schema, c.relname AS table, con.conname AS name,
           con.contype AS type, pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname = ANY($1)
    ORDER BY n.nspname, c.relname, con.conname
    `,
    [schemas],
  );
  const indexes = await rows(
    `
    SELECT schemaname AS schema, tablename AS table, indexname AS name, indexdef AS definition
    FROM pg_indexes
    WHERE schemaname = ANY($1)
    ORDER BY schemaname, tablename, indexname
    `,
    [schemas],
  );
  const triggers = await rows(
    `
    SELECT n.nspname AS schema, c.relname AS table, t.tgname AS name,
           pg_get_triggerdef(t.oid, true) AS definition
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = ANY($1)
    ORDER BY n.nspname, c.relname, t.tgname
    `,
    [schemas],
  );

  const group = (items) => {
    const grouped = new Map();
    for (const item of items) {
      const key = `${item.schema}.${item.table}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    }
    return grouped;
  };
  const columnGroups = group(columns);
  const constraintGroups = group(constraints);
  const indexGroups = group(indexes);
  const triggerGroups = group(triggers);

  return tableCounts.map((table) => {
    const key = `${table.schema}.${table.table}`;
    return {
      ...table,
      columns: columnGroups.get(key) || [],
      constraints: constraintGroups.get(key) || [],
      indexes: indexGroups.get(key) || [],
      triggers: triggerGroups.get(key) || [],
    };
  });
}

async function loadViews(rows, schemas) {
  return rows(
    `
    SELECT schemaname AS schema, viewname AS name, definition
    FROM pg_views
    WHERE schemaname = ANY($1)
    ORDER BY schemaname, viewname
    `,
    [schemas],
  );
}

async function loadRoutines(rows, schemas) {
  return rows(
    `
    SELECT n.nspname AS schema,
           CASE p.prokind WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' WHEN 'w' THEN 'window' ELSE 'function' END AS kind,
           p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS signature,
           pg_get_function_result(p.oid) AS returns,
           l.lanname AS language
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname = ANY($1)
    ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    `,
    [schemas],
  );
}

async function loadTableCounts(rows, schemas) {
  const tables = await rows(
    `
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type='BASE TABLE'
      AND table_schema = ANY($1)
    ORDER BY table_schema, table_name
    `,
    [schemas],
  );

  const output = [];
  for (const table of tables) {
    const countRows = await rows(
      `SELECT count(*)::integer AS rows FROM ${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`,
    );
    output.push({ schema: table.table_schema, table: table.table_name, rows: countRows[0]?.rows || 0 });
  }
  return output;
}

function renderTableStructures(tables) {
  if (!tables.length) return "_None._";
  return tables.map((table) => {
    const columns = markdownTable(
      ["pos", "column", "type", "udt", "nullable", "default"],
      table.columns.map((column) => [column.pos, column.column, column.type, column.udt, column.nullable, column.default]),
    );
    const constraints = table.constraints.length
      ? markdownTable(["name", "type", "definition"], table.constraints.map((item) => [item.name, item.type, item.definition]))
      : "_None._";
    const indexes = table.indexes.length
      ? markdownTable(["name", "definition"], table.indexes.map((item) => [item.name, item.definition]))
      : "_None._";
    const triggers = table.triggers.length
      ? markdownTable(["name", "definition"], table.triggers.map((item) => [item.name, item.definition]))
      : "_None._";
    return `### ${table.schema}.${table.table}\n\nRows: ${table.rows}\n\n#### Columns\n\n${columns}\n\n#### Constraints\n\n${constraints}\n\n#### Indexes\n\n${indexes}\n\n#### Triggers\n\n${triggers}`;
  }).join("\n\n");
}

function renderView(view) {
  return `### ${view.schema}.${view.name}\n\n\`\`\`sql\n${view.definition.trim()}\n\`\`\``;
}

function markdownTable(headers, tableRows) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...tableRows.map((item) => `| ${item.map(escape).join(" | ")} |`),
  ].join("\n");
}

function createRowsLoader(query) {
  const execute = typeof query === "function" ? query : query?.query?.bind(query);
  if (!execute) throw new TypeError("query must be a function or an object with query().");
  return async (sql, params = []) => {
    const result = await execute(sql, params);
    return result.rows || [];
  };
}

function normalizeSchemas(schemas) {
  const values = Array.isArray(schemas) ? schemas : [schemas];
  if (!values.length) throw new Error("At least one schema is required.");
  return values.map((schema) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(schema || ""))) {
      throw new Error(`Unsafe schema identifier: ${schema}`);
    }
    return String(schema);
  });
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
