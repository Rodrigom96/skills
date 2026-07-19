/**
 * Patterns for commands that are safe to run without confirmation.
 */
export const SAFE_PATTERNS = [
  /\bls\b/, /\btree\b/, /\bfind\b/,
  /\bcat\b/, /\bhead\b/, /\btail\b/, /\bless\b/, /\bmkdir\b/,
  /\bgrep\b/, /\brg\b/,
  /\bpwd\b/, /\bwhoami\b/, /\bdate\b/,
  /\bdiff\b/, /\bcomm\b/,
  /\b(echo|printf|true|false)\b/,
  /\bgit\s+(status|log|diff|show|branch|tag|blame|ls-files|rev-parse|describe)\b/,
  /\bnode\s+-e\b/,
];

/**
 * Patterns for commands that are considered dangerous and should
 * always trigger a confirmation prompt.
 */
export const DANGEROUS_PATTERNS = [
  /\brm\b/,
  /\bsudo\b/,
  /\bchmod\b/, /\bchown\b/,
  /\bgit\s+(push|reset|clean)\b/,
  /\btruncate\b/,
  /\bpoweroff\b/, /\breboot\b/,
];

/**
 * Check whether a command is safe to run without user confirmation.
 *
 * A command is safe when it matches at least one safe pattern
 * AND matches no dangerous pattern.
 */
export function isSafeCommand(command: string): boolean {
  if (!SAFE_PATTERNS.some((p) => p.test(command))) return false;
  if (DANGEROUS_PATTERNS.some((p) => p.test(command))) return false;
  return true;
}
