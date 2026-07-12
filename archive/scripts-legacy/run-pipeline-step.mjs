#!/usr/bin/env node

import "./lib/pipeline-env.mjs";
import { spawn } from "node:child_process";
import process from "node:process";
import { requirePipelineCredentials } from "./lib/pipeline-env.mjs";

const options = parseArgs(process.argv.slice(2));

if (!options.command.length) {
  console.error("Usage: node scripts/run-pipeline-step.mjs [--requires database,llm,places] -- node scripts/<step>.mjs [args...]");
  process.exit(2);
}

try {
  requirePipelineCredentials({
    database: options.requires.has("database"),
    llm: options.requires.has("llm"),
    places: options.requires.has("places"),
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const child = spawn(options.command[0], options.command.slice(1), {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function parseArgs(args) {
  const parsed = { requires: new Set(["database"]), command: [] };
  let index = 0;
  while (index < args.length) {
    const arg = args[index];
    if (arg === "--") {
      parsed.command = args.slice(index + 1);
      return parsed;
    }
    if (arg === "--requires") {
      parsed.requires = parseRequires(args[++index]);
    } else if (arg.startsWith("--requires=")) {
      parsed.requires = parseRequires(arg.slice("--requires=".length));
    } else {
      parsed.command = args.slice(index);
      return parsed;
    }
    index += 1;
  }
  return parsed;
}

function parseRequires(value = "") {
  return new Set(String(value).split(",").map((item) => item.trim()).filter(Boolean));
}
