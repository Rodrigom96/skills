import type {
  BashOperations,
  EditOperations,
  ReadOperations,
  WriteOperations,
} from "@earendil-works/pi-coding-agent";

export interface MountDir {
  path: string;
  readOnly?: boolean;
}

export abstract class SandboxBase {
  readonly mounts: MountDir[];

  constructor(mounts: MountDir[]) {
    this.mounts = mounts;
  }

  /** Return a fresh set of read operations backed by this sandbox. */
  abstract readOp(): ReadOperations;

  /** Return a fresh set of write operations backed by this sandbox. */
  abstract writeOp(): WriteOperations;

  /** Return a fresh set of edit operations backed by this sandbox. */
  abstract editOp(): EditOperations;

  /** Return a fresh set of bash operations backed by this sandbox. */
  abstract bashOp(): BashOperations;

  /** Start the sandbox. All mounts are configured at construction time. */
  abstract start(): Promise<void>;

  /** Gracefully shut down the sandbox. */
  abstract stop(): Promise<void>;

  /** Whether the sandbox is currently running. */
  abstract getActive(): boolean;
}
