import assert from "node:assert";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Mode } from "../src/modes/mode";
import { createModeRegistry } from "../src/modes/registry";

const ctx = {} as ExtensionContext;
const events: string[] = [];
class TestMode extends Mode {
  constructor(name: string) { super(name, "•"); }
  async enter(): Promise<void> { events.push(`${this.name}:enter`); }
  async exit(): Promise<void> { events.push(`${this.name}:exit`); }
  onModelSelect(): void { events.push(`${this.name}:model`); }
}

async function main() {
  const registry = createModeRegistry();
  const first = new TestMode("first");
  const second = new TestMode("second");
  registry.register(first);
  registry.register(second);
  assert.deepStrictEqual(registry.names(), ["first", "second"]);
  assert.strictEqual(registry.get("first"), first);
  assert.strictEqual(await registry.switchTo("missing", ctx), false);
  assert.strictEqual(await registry.switchTo("first", ctx), true);
  assert.strictEqual(await registry.switchTo("first", ctx), false);
  registry.notifyManualModelChange();
  assert.strictEqual(await registry.switchTo("second", ctx), true);
  assert.strictEqual(await registry.switchTo(undefined, ctx), true);
  assert.deepStrictEqual(events, ["first:enter", "first:model", "first:exit", "second:enter", "second:exit"]);
  assert.strictEqual(registry.current(), undefined);
  console.log("✅ Mode registry tests passed");
}

void main();
