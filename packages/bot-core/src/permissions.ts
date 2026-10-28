import type { PermissionRuleStore } from '@zbot/database';
import { createId } from '@zbot/shared';
import type { PermissionDecision, PermissionRequest, PermissionResponse } from '@zbot/shared';
import type { ToolPermissionSpec } from '@zbot/tools';
import { CancelledError } from './errors';

interface PendingPermission {
  request: PermissionRequest;
  chatRequestId: string;
  resolve(decision: 'allow' | 'deny'): void;
  reject(error: Error): void;
  cleanup(): void;
}

export interface AuthorizeInput {
  chatRequestId: string;
  taskId: string | null;
  toolName: string;
  spec: ToolPermissionSpec;
  signal: AbortSignal;
}

export type PermissionNotifier = (chatRequestId: string, request: PermissionRequest) => void;

export class PermissionManager {
  private readonly pending = new Map<string, PendingPermission>();

  constructor(
    private readonly rules: PermissionRuleStore,
    private readonly notify: PermissionNotifier
  ) {}

  async authorize(input: AuthorizeInput): Promise<'allow' | 'deny'> {
    if (input.signal.aborted) throw new CancelledError();
    if (!input.spec.requiresConfirmation) return 'allow';

    const stored = this.rules.find(input.toolName, input.spec.scope);
    if (stored === 'allow') return 'allow';
    if (stored === 'deny') return 'deny';

    const request: PermissionRequest = {
      id: createId(),
      taskId: input.taskId,
      toolName: input.toolName,
      title: input.spec.title,
      description: input.spec.description,
      risk: input.spec.risk,
      scope: input.spec.scope,
      operations: input.spec.operations,
      createdAt: Date.now()
    };

    const decision = await new Promise<'allow' | 'deny'>((resolve, reject) => {
      const onAbort = (): void => {
        this.pending.delete(request.id);
        reject(new CancelledError());
      };
      input.signal.addEventListener('abort', onAbort, { once: true });
      this.pending.set(request.id, {
        request,
        chatRequestId: input.chatRequestId,
        resolve,
        reject,
        cleanup: () => input.signal.removeEventListener('abort', onAbort)
      });
      this.notify(input.chatRequestId, request);
    });

    if (decision === 'allow' && input.spec.requiresConfirmation) {
      // allow_once is intentionally not persisted.
    }
    return decision;
  }

  respond(response: PermissionResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      throw new Error('权限请求已失效');
    }
    this.pending.delete(response.requestId);
    pending.cleanup();

    const decision: PermissionDecision = response.decision;
    if (decision === 'deny') {
      pending.resolve('deny');
      return;
    }
    if (decision === 'allow_scope') {
      this.rules.upsert(pending.request.toolName, pending.request.scope, 'allow');
    }
    pending.resolve('allow');
  }

  cancelForChat(chatRequestId: string): void {
    for (const [id, pending] of this.pending) {
      if (pending.chatRequestId !== chatRequestId) continue;
      pending.cleanup();
      pending.reject(new CancelledError());
      this.pending.delete(id);
    }
  }

  cancelAll(): void {
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(new CancelledError());
    }
    this.pending.clear();
  }

  pendingCount(): number {
    return this.pending.size;
  }
}
