import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import type {
  BashOperations,
  EditOperations,
  ReadOperations,
  WriteOperations,
} from "@earendil-works/pi-coding-agent";
import { SandboxBase, type MountDir } from "./base";

export const DEFAULT_DOCKER_IMAGE = "node:22-bookworm";
export type Backend = "gondolin" | "docker";
export function selectBackend(value = process.env.PI_SANDBOX): Backend {
  return value === undefined || value === "docker" ? "docker" : "gondolin";
}

export function shQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function sanitizeEnv(env?: NodeJS.ProcessEnv): Record<string, string> | undefined {
  if (!env) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) if (typeof value === "string") result[key] = value;
  return result;
}

export function dockerMountArgs(mounts: MountDir[]): string[] {
  return mounts.flatMap((mount) => ["--mount", `type=bind,src=${mount.path},dst=${mount.path}${mount.readOnly ? ",readonly" : ""}`]);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Result = { code: number | null; stdout: Buffer; stderr: string };

export class DockerSandbox extends SandboxBase {
  private container: string | null = null;
  private starting: Promise<void> | null = null;
  readonly image: string;

  constructor(mounts: MountDir[], image = process.env.PI_DOCKER_IMAGE || DEFAULT_DOCKER_IMAGE) {
    super(mounts);
    this.image = image;
  }

  private run(args: string[], input?: Buffer, onData?: (data: Buffer) => void, signal?: AbortSignal): Promise<Result> {
    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try { child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] }); }
      catch (error) { reject(new Error(`Docker is unavailable: ${errorText(error)}`)); return; }
      const chunks: Buffer[] = [], errors: Buffer[] = [];
      let settled = false;
      const abort = () => child.kill("SIGKILL");
      const finish = (value: Result) => { if (!settled) { settled = true; signal?.removeEventListener("abort", abort); resolve(value); } };
      child.on("error", (error: NodeJS.ErrnoException) => {
        if (!settled) { settled = true; reject(error.code === "ENOENT" ? new Error("Docker CLI not found; install Docker and ensure it is on PATH") : error); }
      });
      child.stdout?.on("data", (data: Buffer) => { chunks.push(data); onData?.(data); });
      child.stderr?.on("data", (data: Buffer) => { errors.push(data); onData?.(data); });
      child.on("close", (code) => finish({ code, stdout: Buffer.concat(chunks), stderr: Buffer.concat(errors).toString() }));
      signal?.addEventListener("abort", abort, { once: true });
      if (input) child.stdin?.end(input); else child.stdin?.end();
    });
  }

  private getContainer(): string {
    if (!this.container) throw new Error("Docker sandbox not running; call start() first");
    return this.container;
  }

  private async exec(args: string[], input?: Buffer): Promise<Result> {
    const result = await this.run(["exec", "-i", this.getContainer(), ...args], input);
    if (result.code !== 0) throw new Error(`Docker exec failed (${result.code}): ${result.stderr.trim()}`);
    return result;
  }

  readOp(): ReadOperations {
    return {
      readFile: async (p) => (await this.exec(["/bin/cat", p])).stdout,
      access: async (p) => { await this.exec(["/bin/sh", "-lc", `test -r ${shQuote(p)}`]); },
      detectImageMimeType: async (p) => {
        try {
          const r = await this.exec(["/bin/sh", "-lc", `command -v file >/dev/null && file --mime-type -b ${shQuote(p)}`]);
          const mime = r.stdout.toString().trim();
          return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime) ? mime : null;
        } catch { return null; }
      },
    };
  }

  writeOp(): WriteOperations {
    return {
      writeFile: async (p, content) => {
        const script = `set -eu\nmkdir -p ${shQuote(path.posix.dirname(p))}\nbase64 -d > ${shQuote(p)}`;
        await this.exec(["/bin/sh", "-lc", script], Buffer.from(content, "utf8").toString("base64"));
      },
      mkdir: async (dir) => { await this.exec(["/bin/mkdir", "-p", dir]); },
    };
  }

  editOp(): EditOperations {
    const read = this.readOp(), write = this.writeOp();
    return { readFile: read.readFile, access: read.access, writeFile: write.writeFile };
  }

  bashOp(): BashOperations {
    return { exec: async (command, cwd, { onData, signal, timeout, env }) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      let timedOut = false;
      const timer = timeout && timeout > 0 ? setTimeout(() => { timedOut = true; controller.abort(); }, timeout * 1000) : undefined;
      try {
        const args = ["exec", "-i", "-w", cwd];
        for (const [key, value] of Object.entries(sanitizeEnv(env) ?? {})) args.push("-e", `${key}=${value}`);
        args.push(this.getContainer(), "/bin/bash", "-lc", command);
        const result = await this.run(args, undefined, onData, controller.signal);
        if (signal?.aborted) throw new Error("aborted");
        if (timedOut) throw new Error(`timeout:${timeout}`);
        return { exitCode: result.code };
      } finally { if (timer) clearTimeout(timer); signal?.removeEventListener("abort", abort); }
    }};
  }

  async start(): Promise<void> {
    if (this.container) return;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const name = `pi-sandbox-${randomUUID()}`;
      const uid = process.getuid?.(), gid = process.getgid?.();
      const user = uid !== undefined && gid !== undefined ? ["--user", `${uid}:${gid}`] : [];
      const result = await this.run(["run", "-d", "--name", name, ...user, ...dockerMountArgs(this.mounts), this.image, "tail", "-f", "/dev/null"]);
      if (result.code !== 0) throw new Error(`Docker sandbox failed to start: ${result.stderr.trim() || result.stdout.toString().trim()}`);
      this.container = name;
    })().finally(() => { this.starting = null; });
    try { await this.starting; } catch (error) { this.container = null; throw error; }
  }

  async stop(): Promise<void> {
    if (!this.container && this.starting) {
      try { await this.starting; } catch { return; }
    }
    const name = this.container;
    this.container = null;
    if (!name) return;
    const result = await this.run(["rm", "-f", name]);
    if (result.code !== 0 && !/No such container|not found/i.test(result.stderr)) throw new Error(`Failed to remove Docker sandbox: ${result.stderr.trim()}`);
  }

  getActive(): boolean { return this.container !== null; }
}
