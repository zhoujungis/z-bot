export class CancelledError extends Error {
  constructor(message = '任务已取消') {
    super(message);
    this.name = 'CancelledError';
  }
}

export class PermissionDeniedError extends Error {
  constructor(message = '用户拒绝了该操作') {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

export class MaxStepsError extends Error {
  constructor(message = '任务达到最大步骤限制') {
    super(message);
    this.name = 'MaxStepsError';
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof CancelledError ||
    (error instanceof Error && (error.name === 'AbortError' || error.message === 'cancelled'))
  );
}
