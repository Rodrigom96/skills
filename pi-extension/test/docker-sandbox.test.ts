import assert from "node:assert";
import { dockerMountArgs, sanitizeEnv, selectBackend, shQuote } from "../src/sandbox/docker";

assert.deepStrictEqual(dockerMountArgs([
  { path: "/project" },
  { path: "/skills", readOnly: true },
]), [
  "--mount", "type=bind,src=/project,dst=/project",
  "--mount", "type=bind,src=/skills,dst=/skills,readonly",
]);
assert.strictEqual(shQuote("a'b"), "'a'\\''b'");
assert.deepStrictEqual(sanitizeEnv({ OK: "yes", EMPTY: "", OMIT: undefined }), { OK: "yes", EMPTY: "" });
assert.strictEqual(selectBackend(undefined), "docker");
assert.strictEqual(selectBackend("docker"), "docker");
assert.strictEqual(selectBackend("gondolin"), "gondolin");
assert.strictEqual(selectBackend("anything"), "gondolin");
console.log("✅ Docker sandbox unit tests passed");
