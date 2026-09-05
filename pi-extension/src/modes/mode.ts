import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export class Mode {
  readonly name: string;
  readonly icon: string;
  readonly description?: string;

  constructor(name: string, icon: string, description?: string) {
    this.name = name;
    this.icon = icon;
    this.description = description;
  }

  enter(_ctx: ExtensionContext): Promise<void> | void {}
  exit(_ctx: ExtensionContext): Promise<void> | void {}
  onModelSelect(): void {}
}
