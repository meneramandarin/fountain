#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const options = parseArgs(process.argv.slice(2));
const envArgs = (options.envFile || []).flatMap((envFile) => ["--env-file", envFile]);

await run("node", ["scripts/run-postgres-migrations.mjs", ...envArgs]);

if (options.refreshCanonical) {
  const importArgs = ["scripts/import-canonical-to-postgres.mjs", ...envArgs];
  if (!options.noTruncateRaw) {
    importArgs.push("--truncate-raw-before-import");
  }
  if (!options.keepPrevious) {
    importArgs.push("--drop-previous-after-promote");
  }
  await run("node", importArgs);
  await run("node", ["scripts/run-postgres-migrations.mjs", ...envArgs, "--reapply-applied"]);
}

if (options.refreshCanonical && !options.skipRaw) {
  await run("node", ["scripts/sync-source-sqlite-to-postgres.mjs", ...envArgs, "--all", "--chunk-size", String(options.rawChunkSize || 1000)]);
}

if (!options.skipCheck) {
  await run("node", ["scripts/check-postgres-state.mjs", ...envArgs]);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal || code}`));
    });
  });
}

function parseArgs(args) {
  const parsed = {
    keepPrevious: false,
    noTruncateRaw: false,
    refreshCanonical: false,
    skipCheck: false,
    skipRaw: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--refresh-canonical") {
      parsed.refreshCanonical = true;
    } else if (arg === "--keep-previous") {
      parsed.keepPrevious = true;
    } else if (arg === "--no-truncate-raw") {
      parsed.noTruncateRaw = true;
    } else if (arg === "--skip-check") {
      parsed.skipCheck = true;
    } else if (arg === "--skip-raw") {
      parsed.skipRaw = true;
    } else if (arg.startsWith("--") && next) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (key === "envFile") {
        parsed.envFile = [...(parsed.envFile || []), next];
      } else {
        parsed[key] = next;
      }
      index += 1;
    }
  }
  return parsed;
}
