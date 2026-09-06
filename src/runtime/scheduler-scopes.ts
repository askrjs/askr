// Nested permissions are independent of the scheduler's drain loop.
export class SchedulerScopes {
  private handlerScopes = 0;
  private handlerFlag = false;
  private progressScopes = 0;

  get inHandler(): boolean {
    return this.handlerFlag || this.handlerScopes > 0;
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

  setHandlerFlag(value: boolean): void {
    this.handlerFlag = value;
  }

  adjustProgress(delta: 1 | -1): void {
    this.progressScopes += delta;
  }
}
