import assert from "node:assert";
import { isSafeCommand } from "../src/index";

const tests = [
  // Safe commands
  ["ls", true],
  ["ls -la", true],
  ["ls -lh", true],
  ["cat package.json", true],
  ["head -n 10 file.ts", true],
  ["tail -n 5 file.ts", true],
  ["grep 'error' *.log", true],
  ["rg 'pattern'", true],
  ["find . -name '*.ts'", true],
  ["tree", true],
  ["pwd", true],
  ["whoami", true],
  ["date", true],
  ["diff a.txt b.txt", true],
  ["echo 'hello'", true],
  ["git status", true],
  ["git log --oneline", true],
  ["git diff", true],
  ["git show abc123", true],
  ["git branch", true],
  ["git tag", true],
  ["git blame file.ts", true],
  ["node -e 'console.log(1)'", true],
  // Destructive commands
  ["rm -rf dist/", false],
  ["rm -f file.ts", false],
  ["rm --recursive dir/", false],
  ["sudo apt update", false],
  ["chmod 777 file", false],
  ["git push --force", false],
  ["git push -f", false],
  ["git reset --hard", false],
  ["git clean -fd", false],
  ["truncate -s 0 file", false],
  ["reboot", false],
  // Edge cases
  ["echo hello && rm -rf /", false],
  ["", false],
  ["unknown", false],
];

for (const [command, expected] of tests) {
  const result = isSafeCommand(command);
  assert.strictEqual(
    result,
    expected,
    `'${command}' expected ${expected}, got ${result}`,
  );
}

console.log("✅ All tests passed");
