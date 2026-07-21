import path from "node:path";

import type {
  BashOperations,
  EditOperations,
  ReadOperations,
  WriteOperations,
} from "@earendil-works/pi-coding-agent";

import {
  RealFSProvider,
  VM,
} from "@earendil-works/gondolin";

import { SandboxBase, type MountDir } from "./base";

function shQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

/** Resolve a local path to its guest path using the mount configuration. */
function localPathToGuest(localPath: string, mounts: MountDir[]): string {
  // If the path is already a guest path (starts with mount target), pass through
  for (const mount of mounts) {
    if (localPath === mount.target || localPath.startsWith(mount.target + path.posix.sep)) {
      return localPath;
    }
  }
  // Otherwise convert host path to guest path
  for (const mount of mounts) {
    const rel = path.relative(mount.source, localPath);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      const posixRel = rel.split(path.sep).join(path.posix.sep);
      return path.posix.join(mount.target, posixRel);
    }
  }
  throw new Error(`path is not under any mount: ${localPath}`);
}

function sanitizeEnv(
  env?: NodeJS.ProcessEnv,
): Record<string, string> | undefined {
  if (!env) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function createGondolinReadOps(vm: VM, mounts: MountDir[]): ReadOperations {
  return {
    readFile: async (p) => {
      const guestPath = localPathToGuest(p, mounts);
      const r = await vm.exec(["/bin/cat", guestPath]);
      if (!r.ok) {
        throw new Error(`cat failed (${r.exitCode}): ${r.stderr}`);
      }
      return r.stdoutBuffer;
    },
    access: async (p) => {
      const guestPath = localPathToGuest(p, mounts);
      const r = await vm.exec([
        "/bin/sh",
        "-lc",
        `test -r ${shQuote(guestPath)}`,
      ]);
      if (!r.ok) {
        throw new Error(`not readable: ${p}`);
      }
    },
    detectImageMimeType: async (p) => {
      const guestPath = localPathToGuest(p, mounts);
      try {
        const r = await vm.exec([
          "/bin/sh",
          "-lc",
          `file --mime-type -b ${shQuote(guestPath)}`,
        ]);
        if (!r.ok) return null;
        const m = r.stdout.trim();
        return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
          m,
        )
          ? m
          : null;
      } catch {
        return null;
      }
    },
  };
}

function createGondolinWriteOps(vm: VM, mounts: MountDir[]): WriteOperations {
  return {
    writeFile: async (p, content) => {
      const guestPath = localPathToGuest(p, mounts);
      const dir = path.posix.dirname(guestPath);

      const b64 = Buffer.from(content, "utf8").toString("base64");
      const script = [
        `set -eu`,
        `mkdir -p ${shQuote(dir)}`,
        `echo ${shQuote(b64)} | base64 -d > ${shQuote(guestPath)}`,
      ].join("\n");

      const r = await vm.exec(["/bin/sh", "-lc", script]);
      if (!r.ok) {
        throw new Error(`write failed (${r.exitCode}): ${r.stderr}`);
      }
    },
    mkdir: async (dir) => {
      const guestDir = localPathToGuest(dir, mounts);
      const r = await vm.exec(["/bin/mkdir", "-p", guestDir]);
      if (!r.ok) {
        throw new Error(`mkdir failed (${r.exitCode}): ${r.stderr}`);
      }
    },
  };
}

function createGondolinEditOps(vm: VM, mounts: MountDir[]): EditOperations {
  const r = createGondolinReadOps(vm, mounts);
  const w = createGondolinWriteOps(vm, mounts);
  return { readFile: r.readFile, access: r.access, writeFile: w.writeFile };
}

function createGondolinBashOps(vm: VM, mounts: MountDir[]): BashOperations {
  return {
    exec: async (command, cwd, { onData, signal, timeout, env }) => {
      const guestCwd = localPathToGuest(cwd, mounts);

      const ac = new AbortController();
      const onAbort = () => ac.abort();
      signal?.addEventListener("abort", onAbort, { once: true });

      let timedOut = false;
      const timer =
        timeout && timeout > 0
          ? setTimeout(() => {
              timedOut = true;
              ac.abort();
            }, timeout * 1000)
          : undefined;

      try {
        const proc = vm.exec(["/bin/bash", "-lc", command], {
          cwd: guestCwd,
          signal: ac.signal,
          env: sanitizeEnv(env),
          stdout: "pipe",
          stderr: "pipe",
        });

        for await (const chunk of proc.output()) {
          onData(chunk.data);
        }

        const r = await proc;
        return { exitCode: r.exitCode };
      } catch (err) {
        if (signal?.aborted) throw new Error("aborted");
        if (timedOut) throw new Error(`timeout:${timeout}`);
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

export class GondolinSandbox extends SandboxBase {
  private vm: VM | null = null;
  private vmStarting: Promise<VM> | null = null;

  constructor(mounts: MountDir[]) {
    super(mounts);
  }

  readOp(): ReadOperations {
    if (!this.vm) throw new Error("sandbox not running");
    return createGondolinReadOps(this.vm, this.mounts);
  }

  writeOp(): WriteOperations {
    if (!this.vm) throw new Error("sandbox not running");
    return createGondolinWriteOps(this.vm, this.mounts);
  }

  editOp(): EditOperations {
    if (!this.vm) throw new Error("sandbox not running");
    return createGondolinEditOps(this.vm, this.mounts);
  }

  bashOp(): BashOperations {
    if (!this.vm) throw new Error("sandbox not running");
    return createGondolinBashOps(this.vm, this.mounts);
  }

  async start(): Promise<void> {
    if (this.vm) return;
    if (this.vmStarting) return;

    this.vmStarting = (async () => {
      const vmMounts: Record<string, RealFSProvider> = {};

      for (const mount of this.mounts) {
        vmMounts[mount.target] = new RealFSProvider(mount.source);
      }

      const created = await VM.create({
        vfs: {
          mounts: vmMounts,
        },
      });

      this.vm = created;
      return created;
    })();

    return this.vmStarting;
  }

  async stop(): Promise<void> {
    if (!this.vm) return;
    try {
      await this.vm.close();
    } finally {
      this.vm = null;
      this.vmStarting = null;
    }
  }

  getActive(): boolean {
    return this.vm !== null;
  }

  /** Lazily get the running VM, or throw if sandbox is not started. */
  private getVM(): VM {
    if (!this.vm) throw new Error("sandbox not running");
    return this.vm;
  }

  /** Helper for use-cases that need direct access to the VM. */
  _getVM(): VM | null {
    return this.vm;
  }
}
