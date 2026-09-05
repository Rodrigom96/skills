import path from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createLocalBashOperations,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";

import { GondolinSandbox } from "./gondolin";
import { DockerSandbox, selectBackend, type Backend } from "./docker";
import { SandboxBase, type MountDir } from "./base";

export { selectBackend };


function buildMounts(localCwd: string, skillParentDirs: string[]): MountDir[] {
  const mounts: MountDir[] = [{ path: localCwd }];

  const seenPaths = new Set<string>();
  seenPaths.add(localCwd);

  for (const dir of skillParentDirs) {
    if (!seenPaths.has(dir)) {
      seenPaths.add(dir);
      mounts.push({ path: dir });
    }
  }

  return mounts;
}

export default function sandboxExtension(
  pi: ExtensionAPI,
  sandbox: SandboxBase | null = null,
) {
  const localCwd = process.cwd();
  const injected = sandbox;
  let activeSandbox: SandboxBase | undefined = injected ?? undefined;
  let backend: Backend = selectBackend();
  let skillParentDirs: string[] = [];

  function backendLabel(sb = activeSandbox): string {
    return sb instanceof DockerSandbox ? `Docker (${sb.image})` : "Gondolin";
  }

  function createSandbox(kind: Backend, dirs = skillParentDirs): SandboxBase {
    const mounts = buildMounts(localCwd, dirs);
    return kind === "docker" ? new DockerSandbox(mounts) : new GondolinSandbox(mounts);
  }

  function mountsMatch(sb: SandboxBase, mounts: MountDir[]): boolean {
    return sb.mounts.length === mounts.length && sb.mounts.every((mount, i) =>
      mount.path === mounts[i].path && !!mount.readOnly === !!mounts[i].readOnly,
    );
  }

  const localRead = createReadTool(localCwd);
  const localWrite = createWriteTool(localCwd);
  const localEdit = createEditTool(localCwd);
  const localBash = createBashTool(localCwd);

  async function ensureStarted(
    sb: SandboxBase,
    ctx: ExtensionContext,
  ): Promise<void> {
    const wasActive = sb.getActive();
    await sb.start();
    if (!wasActive) {
      ctx.ui.setWidget(
        "sandbox",
        [ctx.ui.theme.fg(
          "accent",
          `${backendLabel(sb)}: running (mounts: ${sb.mounts.map((m) => m.path).join(" | ")})`,
        )],
        { placement: "belowEditor" },
      );
    }
  }

  function getOrCreateSandbox(
    ctx: ExtensionContext,
    skillParentDirs: string[],
  ): SandboxBase {
    if (injected) return injected;
    if (!activeSandbox) activeSandbox = createSandbox(backend, skillParentDirs);
    return activeSandbox;
  }

  async function ensureOps(
    ctx: ExtensionContext,
    skillParentDirs?: string[],
  ) {
    const sb = getOrCreateSandbox(ctx, skillParentDirs ?? []);
    await ensureStarted(sb, ctx);
    return {
      read: sb.readOp(),
      write: sb.writeOp(),
      edit: sb.editOp(),
      bash: sb.bashOp(),
    };
  }

  pi.registerTool({
    ...localRead,
    async execute(id, params, signal, onUpdate, ctx) {
      const ops = await ensureOps(ctx);
      const tool = createReadTool(localCwd, { operations: ops.read });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localWrite,
    async execute(id, params, signal, onUpdate, ctx) {
      const ops = await ensureOps(ctx);
      const tool = createWriteTool(localCwd, { operations: ops.write });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localEdit,
    async execute(id, params, signal, onUpdate, ctx) {
      const ops = await ensureOps(ctx);
      const tool = createEditTool(localCwd, { operations: ops.edit });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerTool({
    ...localBash,
    async execute(id, params, signal, onUpdate, ctx) {
      const ops = await ensureOps(ctx);
      const tool = createBashTool(localCwd, { operations: ops.bash });
      return tool.execute(id, params, signal, onUpdate);
    },
  });

  pi.registerCommand("sandbox", {
    description: "Switch or inspect the sandbox backend (gondolin or docker)",
    getArgumentCompletions: (prefix) => ["gondolin", "docker"]
      .filter((name) => name.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      if (injected) {
        ctx.ui.notify("Sandbox backend cannot be switched when a custom sandbox was injected.", "warning");
        return;
      }
      let requested = args.trim() as Backend | "";
      if (!requested) {
        const choice = await ctx.ui.select("Select sandbox backend:", ["gondolin", "docker"]);
        if (!choice) return;
        requested = choice as Backend;
      }
      if (requested !== "gondolin" && requested !== "docker") {
        ctx.ui.notify("Usage: /sandbox [gondolin|docker]", "warning");
        return;
      }
      if (requested === backend && activeSandbox?.getActive()) {
        ctx.ui.notify(`${backendLabel()} is already active.`, "info");
        return;
      }
      if (activeSandbox) await activeSandbox.stop();
      activeSandbox = createSandbox(requested);
      backend = requested;
      await ensureStarted(activeSandbox, ctx);
      ctx.ui.notify(`Switched to ${backendLabel()}.`, "info");
    },
  });

  // Run user `!` commands inside the sandbox too
  pi.on("user_bash", (_event, ctx) => {
    if (!activeSandbox || !activeSandbox.getActive()) return;
    return { operations: activeSandbox.bashOp() };
  });

  // Block host_bash until user approves (prevents execution + stops agent)
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "host_bash") return;

    const command = (event.input as { command: string }).command;

    const ok = await ctx.ui.confirm(
      "Host Bash",
      `Run on HOST:\n\n  ${command}\n\nAllow?`,
    );

    if (!ok) {
      return {
        block: true,
        reason:
          "User blocks host_bash commands. Stop and wait for next instruction",
      };
    }
  });

  // host_bash: runs on host machine, always requires user approval
  pi.registerTool(
    (() => {
      const tool = createBashTool(localCwd, {
        operations: createLocalBashOperations(),
      });
      return {
        ...tool,
        name: "host_bash",
        label: "Host Bash",
        description: `Execute a bash command on the HOST machine (outside sandbox).

Use 'host_bash' tool for: npm, python, yarn, pnpm, cargo, make, go build, or any package manager / build tool.
Use 'bash' tool for: file ops, git, grep, find, ls, cat, and general shell commands.
Every execution requires user approval.`,
        execute: async (_id, params, signal, onUpdate, ctx) => {
          return tool.execute(_id, params, signal, onUpdate, ctx);
        },
      };
    })(),
  );

  pi.on("session_start", async (_event, ctx) => {
    await ensureStarted(getOrCreateSandbox(ctx, skillParentDirs), ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const nextSkillParentDirs: string[] = [];
    const seenParents = new Set<string>();
    for (const skill of event.systemPromptOptions.skills ?? []) {
      const parent = path.dirname(skill.baseDir);
      const resolved = path.resolve(parent);
      if (!seenParents.has(resolved)) {
        seenParents.add(resolved);
        nextSkillParentDirs.push(resolved);
      }
    }

    skillParentDirs = nextSkillParentDirs;
    let currentSandbox = getOrCreateSandbox(ctx, skillParentDirs);
    const requiredMounts = buildMounts(localCwd, skillParentDirs);
    if (!injected && !mountsMatch(currentSandbox, requiredMounts)) {
      await currentSandbox.stop();
      activeSandbox = currentSandbox = createSandbox(backend, skillParentDirs);
    }
    if (!currentSandbox.getActive()) await ensureStarted(currentSandbox, ctx);

    const guidance = `

You are working inside a ${backendLabel(currentSandbox)} sandbox. File tools (read, write, edit) and 'bash' run inside this sandbox.

The sandbox mounts your project and skill directories, so file paths and commands work the same as on the host. Container tools depend on the selected image. Some host tools (npm, python, cargo, make) may not be available inside the sandbox — use 'host_bash' for those.
`;
    return { systemPrompt: event.systemPrompt + guidance };
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!activeSandbox || !activeSandbox.getActive()) return;
    ctx.ui.setWidget(
      "sandbox",
      [ctx.ui.theme.fg("muted", `${backendLabel()}: stopping`)],
      { placement: "belowEditor" },
    );
    await activeSandbox.stop();
  });
}
