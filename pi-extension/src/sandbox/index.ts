import path from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";

import { GondolinSandbox } from "./gondolin";
import { SandboxBase, type MountDir } from "./base";

const GUEST_WORKSPACE = "/workspace";

function buildMounts(localCwd: string, skillParentDirs: string[]): MountDir[] {
  const mounts: MountDir[] = [{ source: localCwd, target: GUEST_WORKSPACE }];

  const seenTargets = new Set<string>();
  seenTargets.add(GUEST_WORKSPACE);

  for (const dir of skillParentDirs) {
    if (!seenTargets.has(dir)) {
      seenTargets.add(dir);
      mounts.push({ source: dir, target: dir });
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
          `Gondolin: running (mounts: ${sb.mounts.map((m) => `${m.source}:${m.target}`).join(" | ")})`,
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

    const guestCwd = GUEST_WORKSPACE;
    const modified = event.systemPrompt.replace(
      `Current working directory: ${localCwd}`,
      `Current working directory: ${guestCwd} (${activeSandbox.constructor.name}, mounted from host: ${localCwd})`,
    );
    return { systemPrompt: modified };
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
