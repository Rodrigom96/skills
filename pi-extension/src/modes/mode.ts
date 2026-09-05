import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export abstract class Mode {
  readonly name: string;
  readonly icon: string;

  constructor(name: string, icon: string) {
    this.name = name;
    this.icon = icon;
  }

  abstract enter(ctx: ExtensionContext): Promise<void> | void;
  abstract exit(ctx: ExtensionContext): Promise<void> | void;
  onModelSelect(): void {}
}
