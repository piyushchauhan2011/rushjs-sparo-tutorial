// Runs the apps/api and apps/web dev servers together, each through `rushx dev`
// so that a project's watch server is started exactly the way rushjs.io
// documents for everyday development.
//
// Backs the `rush dev` custom command; see common/config/rush/command-line.json.
//
// Each child is spawned `detached`, giving it its own process group. That is the
// whole point of this script: `rushx dev` expands to an
// install-run-rushx -> rushx -> shell -> server chain, and signalling only the
// leader PID kills the launcher while leaving the server itself alive, still
// holding its port. Signalling the group tears the whole chain down. So this
// script traps SIGINT/SIGTERM and forwards them to each child's *group*, and
// does the same when one server exits on its own so the other doesn't linger.
//
// The cost of `detached` is that the children are no longer in the terminal's
// foreground process group, so Ctrl+C no longer reaches them on its own -- hence
// the explicit forwarding -- and they get no stdin (reading the tty from a
// background group would stop them with SIGTTIN). Neither server needs stdin;
// this only costs Vite's interactive keypress shortcuts.

const { spawn } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const installRunRushx = path.join(__dirname, "install-run-rushx.js");

const PROJECTS = [
  { name: "api", folder: "apps/api" },
  { name: "web", folder: "apps/web" },
];

const children = new Map();
let shuttingDown = false;

function signalGroup(child, signal) {
  try {
    // Negative PID => the whole process group, not just the launcher.
    process.kill(-child.pid, signal);
  } catch {
    // Already gone.
  }
}

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children.values()) {
    signalGroup(child, signal);
  }
}

for (const { name, folder } of PROJECTS) {
  // -q suppresses both banner layers: install-run-rushx's "requests Rush
  // version ..." lines and rushx's own "Rush Multi-Project Build Tool" header.
  // With two servers starting at once those interleave into unreadable noise.
  const child = spawn(process.execPath, [installRunRushx, "-q", "dev"], {
    cwd: path.join(repoRoot, folder),
    // No stdin: see the note above about SIGTTIN.
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });

  children.set(name, child);

  child.on("exit", (code, signal) => {
    children.delete(name);
    if (!shuttingDown) {
      console.error(
        `\n[${name}] exited (${signal || `code ${code}`}); stopping the other server.`,
      );
      process.exitCode = signal ? 1 : (code ?? 1);
      shutdown("SIGINT");
    }
  });

  child.on("error", (error) => {
    children.delete(name);
    console.error(`[${name}] failed to start: ${error.message}`);
    process.exitCode = 1;
    shutdown("SIGINT");
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}
