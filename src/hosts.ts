import { Controller } from './controller';

/**
 * Tracks all live FishReader webviews (sidebar view + any editor tabs) and which
 * one the user last interacted with, so global commands (boss hotkey, next/prev)
 * route to the right one.
 */
export class HostRegistry {
  private active?: Controller;
  private readonly all = new Set<Controller>();

  add(c: Controller) {
    this.all.add(c);
    this.active = c;
  }

  markActive(c: Controller) {
    this.active = c;
  }

  remove(c: Controller) {
    this.all.delete(c);
    if (this.active === c) this.active = undefined;
  }

  /** The controller for the most recently active webview, or any live one. */
  get(): Controller | undefined {
    if (this.active && this.all.has(this.active)) return this.active;
    return this.all.values().next().value;
  }

  broadcastActiveFile() {
    this.all.forEach((c) => c.sendActiveFile());
  }
}
