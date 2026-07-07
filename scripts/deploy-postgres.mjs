#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const options = parseArgs(process.argv.slice(2));
const envArgs = (options.envFile || []).flatMap((envFile) => ["--env-file", envFile]);

await run("node", ["scripts/run-postgres-migrations.mjs", ...envArgs]);

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
    skipCheck: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--skip-check") {
      parsed.skipCheck = true;
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
