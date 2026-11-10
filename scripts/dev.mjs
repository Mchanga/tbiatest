import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const services = ["backend", "Frontend"];
const children = [];
let stopping = false;
let exitCode = 0;
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("Run this command through npm: npm run dev");
}

const stopChildren = (code = 0) => {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
};

for (const service of services) {
  const child = spawn(
    process.execPath,
    [npmCli, "--prefix", path.join(root, service), "run", "dev"],
    { cwd: root, stdio: "inherit" },
  );
  children.push(child);
  child.on("error", (error) => {
    console.error(`Unable to start ${service}: ${error.message}`);
    stopChildren(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      if (code !== 0) {
        console.error(`${service} stopped${signal ? ` (${signal})` : ` with exit code ${code}`}.`);
        stopChildren(code || 1);
      } else stopChildren(0);
    }
    if (stopping && children.every((entry) => entry.exitCode !== null)) {
      process.exitCode = exitCode;
    }
  });
}

process.on("SIGINT", () => stopChildren(0));
process.on("SIGTERM", () => stopChildren(0));
