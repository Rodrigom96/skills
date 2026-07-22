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
import { SandboxBase, type MountDir } from "./base";


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
  let activeSandbox: SandboxBase | undefined;

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
        "gondolin",
        [ctx.ui.theme.fg(
          "accent",
          `Gondolin: running (mounts: ${sb.mounts.map((m) => m.path).join(" | ")})`,
        )],
        { placement: "belowEditor" },
      );
    }
  }

  function getOrCreateSandbox(
    ctx: ExtensionContext,
    skillParentDirs: string[],
  ): SandboxBase {
    if (sandbox) return sandbox;
    if (!activeSandbox) {
      const mounts = buildMounts(localCwd, skillParentDirs);
      activeSandbox = new GondolinSandbox(mounts);
    }
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

  pi.on("before_agent_start", async (event, ctx) => {
    const skillParentDirs: string[] = [];
    const seenParents = new Set<string>();
    for (const skill of event.systemPromptOptions.skills ?? []) {
      const parent = path.dirname(skill.baseDir);
      const resolved = path.resolve(parent);
      if (!seenParents.has(resolved)) {
        seenParents.add(resolved);
        skillParentDirs.push(resolved);
      }
    }

    const activeSandbox = getOrCreateSandbox(ctx, skillParentDirs);
    await ensureStarted(activeSandbox, ctx);

    const guidance = `

You are working inside a Gondolin VM sandbox. File tools (read, write, edit) and 'bash' run inside this sandbox.

The sandbox mounts your project and skill directories, so file paths and commands work the same as on the host. Some host tools (npm, python, cargo, make) are not available inside the sandbox — use 'host_bash' for those.
`;
    return { systemPrompt: event.systemPrompt + guidance };
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!activeSandbox || !activeSandbox.getActive()) return;
    ctx.ui.setWidget(
      "gondolin",
      [ctx.ui.theme.fg("muted", "Gondolin: stopping")],
      { placement: "belowEditor" },
    );
    await activeSandbox.stop();
  });
}
