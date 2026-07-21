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

function createGondolinReadOps(vm: VM): ReadOperations {
  return {
    readFile: async (p) => {
      const r = await vm.exec(["/bin/cat", p]);
      if (!r.ok) {
        throw new Error(`cat failed (${r.exitCode}): ${r.stderr}`);
      }
      return r.stdoutBuffer;
    },
    access: async (p) => {
      const r = await vm.exec([
        "/bin/sh",
        "-lc",
        `test -r ${shQuote(p)}`,
      ]);
      if (!r.ok) {
        throw new Error(`not readable: ${p}`);
      }
    },
    detectImageMimeType: async (p) => {
      try {
        const r = await vm.exec([
          "/bin/sh",
          "-lc",
          `file --mime-type -b ${shQuote(p)}`,
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

function createGondolinWriteOps(vm: VM): WriteOperations {
  return {
    writeFile: async (p, content) => {
      const dir = path.posix.dirname(p);

      const b64 = Buffer.from(content, "utf8").toString("base64");
      const script = [
        `set -eu`,
        `mkdir -p ${shQuote(dir)}`,
        `echo ${shQuote(b64)} | base64 -d > ${shQuote(p)}`,
      ].join("\n");

      const r = await vm.exec(["/bin/sh", "-lc", script]);
      if (!r.ok) {
        throw new Error(`write failed (${r.exitCode}): ${r.stderr}`);
      }
    },
    mkdir: async (dir) => {
      const r = await vm.exec(["/bin/mkdir", "-p", dir]);
      if (!r.ok) {
        throw new Error(`mkdir failed (${r.exitCode}): ${r.stderr}`);
      }
    },
  };
}

function createGondolinEditOps(vm: VM): EditOperations {
  const r = createGondolinReadOps(vm);
  const w = createGondolinWriteOps(vm);
  return { readFile: r.readFile, access: r.access, writeFile: w.writeFile };
}

function createGondolinBashOps(vm: VM): BashOperations {
  return {
    exec: async (command, cwd, { onData, signal, timeout, env }) => {

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
          cwd: cwd,
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
    return createGondolinReadOps(this.vm);
  }

  writeOp(): WriteOperations {
    if (!this.vm) throw new Error("sandbox not running");
    return createGondolinWriteOps(this.vm);
  }

  editOp(): EditOperations {
    if (!this.vm) throw new Error("sandbox not running");
    return createGondolinEditOps(this.vm);
  }

  bashOp(): BashOperations {
    if (!this.vm) throw new Error("sandbox not running");
    return createGondolinBashOps(this.vm);
  }

  async start(): Promise<void> {
    if (this.vm) return;
    if (this.vmStarting) return;

    this.vmStarting = (async () => {
      const vmMounts: Record<string, RealFSProvider> = {};

      for (const mount of this.mounts) {
        vmMounts[mount.path] = new RealFSProvider(mount.path);
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
