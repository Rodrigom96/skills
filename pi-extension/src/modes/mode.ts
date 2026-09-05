import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface Mode {
  name: string;
  enter(ctx: ExtensionContext): Promise<void> | void;
  exit(ctx: ExtensionContext): Promise<void> | void;
  onModelSelect?(): void;
}
