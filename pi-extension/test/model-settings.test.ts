import assert from "node:assert";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatModelIdentity, getModeModel, parseModelIdentity, setModeModel } from "../src/models/settings";

assert.deepStrictEqual(parseModelIdentity("openai/gpt-4"), { provider: "openai", modelId: "gpt-4" });
assert.strictEqual(parseModelIdentity("missing-slash"), undefined);
assert.strictEqual(parseModelIdentity(42), undefined);
assert.strictEqual(formatModelIdentity("openai", "gpt-4"), "openai/gpt-4");

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "pi-settings-"));
  const path = join(dir, "settings.json");
  assert.strictEqual(await getModeModel("plan", path), undefined);
  await writeFile(path, "not json");
  assert.strictEqual(await getModeModel("plan", path), undefined);
  await writeFile(path, JSON.stringify({ defaultModel: "gpt", unrelated: true }));
  await setModeModel("plan", "openai/gpt-4", path);
  const settings = JSON.parse(await readFile(path, "utf8"));
  assert.strictEqual(settings.unrelated, true);
  assert.strictEqual(settings.modes.plan.model, "openai/gpt-4");
  await setModeModel("plan", undefined, path);
  assert.strictEqual((await getModeModel("plan", path)), undefined);
  console.log("✅ Model settings tests passed");
}
void main();
