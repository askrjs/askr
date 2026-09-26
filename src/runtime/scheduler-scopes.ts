// Nested permissions are independent of the scheduler's drain loop.
export class SchedulerScopes {
  private handlerScopes = 0;
  private progressScopes = 0;

  get inHandler(): boolean {
    return this.handlerScopes > 0;
  }

  get allowSyncProgress(): boolean {
    return this.progressScopes > 0;
  }

  canKick(running: boolean): boolean {
    return !running && !this.inHandler && !this.allowSyncProgress;
  }

  adjustHandler(delta: 1 | -1): void {
    this.handlerScopes += delta;
  }

  adjustProgress(delta: 1 | -1): void {
    this.progressScopes += delta;
  }
}
