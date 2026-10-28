import { create } from 'zustand';
import type {
  AttachmentInput,
  ChatEvent,
  ChatSendInput,
  Conversation,
  Memory,
  Message,
  PermissionDecision,
  PermissionRequest,
  Task,
  ToolCallView
} from '@zbot/shared';
import { createId } from '@zbot/shared';

export interface PendingAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataBase64: string;
  kind: 'image' | 'file';
  previewUrl: string | null;
  size: number;
}

export interface ActiveChat {
  requestId: string;
  conversationId: string;
  assistantMessageId: string;
  draft: string;
  toolCalls: ToolCallView[];
  task: Task | null;
  finished: boolean;
}

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  loadingConversation: boolean;
  loadingConversations: boolean;
  submitting: boolean;
  streaming: boolean;
  active: ActiveChat | null;
  pendingPermission: PermissionRequest | null;
  pendingAttachments: PendingAttachment[];
  memoryNotice: Memory | null;
  error: string | null;
  notice: string | null;
  loadConversations(): Promise<void>;
  openConversation(id: string): Promise<void>;
  newChat(): void;
  send(content: string, quickAction?: ChatSendInput['quickAction']): Promise<boolean>;
  cancel(): Promise<void>;
  respondPermission(decision: PermissionDecision): Promise<void>;
  addAttachment(input: AttachmentInput, previewUrl?: string | null): void;
  removeAttachment(id: string): void;
  handleEvent(event: ChatEvent): void;
  clearError(): void;
  clearNotice(): void;
  clearMemoryNotice(): void;
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '');
}

async function refreshConversation(
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
  conversationId: string
): Promise<void> {
  try {
    const detail = await window.zbot.conversations.get(conversationId);
    if (get().currentConversationId !== conversationId) return;
    set({ messages: detail.messages });
  } catch (error) {
    set({ error: errorMessage(error) });
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  loadingConversation: false,
  loadingConversations: false,
  submitting: false,
  streaming: false,
  active: null,
  pendingPermission: null,
  pendingAttachments: [],
  memoryNotice: null,
  error: null,
  notice: null,

  async loadConversations() {
    set({ loadingConversations: true });
    try {
      set({ conversations: await window.zbot.conversations.list(), loadingConversations: false });
    } catch (error) {
      set({ error: errorMessage(error), loadingConversations: false });
    }
  },

  async openConversation(id) {
    set({ currentConversationId: id, loadingConversation: true, error: null });
    try {
      const detail = await window.zbot.conversations.get(id);
      if (get().currentConversationId !== id) return;
      set({ messages: detail.messages, loadingConversation: false });
    } catch (error) {
      set({ error: errorMessage(error), loadingConversation: false });
    }
  },

  newChat() {
    if (get().streaming) return;
    set({
      currentConversationId: null,
      messages: [],
      active: null,
      pendingPermission: null,
      pendingAttachments: [],
      error: null,
      notice: null,
      memoryNotice: null
    });
  },

  async send(content, quickAction) {
    if (get().streaming || get().submitting) return false;
    const trimmed = content.trim();
    const attachments = get().pendingAttachments;
    if (!trimmed && attachments.length === 0) return false;
    set({ submitting: true, error: null, notice: null, memoryNotice: null });

    try {
      const input: ChatSendInput = {
        ...(get().currentConversationId
          ? { conversationId: get().currentConversationId! }
          : {}),
        content: trimmed,
        attachments: attachments.map((attachment) => ({
          name: attachment.name,
          mimeType: attachment.mimeType,
          dataBase64: attachment.dataBase64,
          kind: attachment.kind
        })),
        ...(quickAction ? { quickAction } : {})
      };
      const result = await window.zbot.chat.send(input);
      set({
        submitting: false,
        currentConversationId: result.conversationId,
        pendingAttachments: []
      });
      await Promise.all([get().openConversation(result.conversationId), get().loadConversations()]);
      return true;
    } catch (error) {
      set({ submitting: false, error: errorMessage(error) });
      return false;
    }
  },

  async cancel() {
    const requestId = get().active?.requestId;
    if (!requestId) return;
    try {
      await window.zbot.chat.cancel(requestId);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  async respondPermission(decision) {
    const request = get().pendingPermission;
    if (!request) return;
    try {
      await window.zbot.permissions.respond({ requestId: request.id, decision });
      set({ pendingPermission: null });
    } catch (error) {
      set({ error: errorMessage(error), pendingPermission: null });
    }
  },

  addAttachment(input, previewUrl = null) {
    set((state) => ({
      pendingAttachments: [
        ...state.pendingAttachments,
        {
          id: createId(),
          name: input.name,
          mimeType: input.mimeType,
          dataBase64: input.dataBase64,
          kind: input.kind,
          previewUrl,
          size: Math.floor((input.dataBase64.length * 3) / 4)
        }
      ].slice(0, 6)
    }));
  },

  removeAttachment(id) {
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((attachment) => attachment.id !== id)
    }));
  },

  handleEvent(event) {
    switch (event.type) {
      case 'chat.started': {
        set({
          submitting: false,
          streaming: true,
          currentConversationId: event.conversationId,
          active: {
            requestId: event.requestId,
            conversationId: event.conversationId,
            assistantMessageId: event.assistantMessageId,
            draft: '',
            toolCalls: [],
            task: null,
            finished: false
          }
        });
        void refreshConversation(set, get, event.conversationId);
        void get().loadConversations();
        break;
      }
      case 'chat.delta': {
        set((state) => {
          if (!state.active || state.active.requestId !== event.requestId) return {};
          return {
            active: {
              ...state.active,
              draft: state.active.draft + event.delta
            }
          };
        });
        break;
      }
      case 'chat.tool': {
        set((state) => {
          if (!state.active || state.active.requestId !== event.requestId) return {};
          const existing = state.active.toolCalls.findIndex(
            (call) => call.id === event.toolCall.id
          );
          const toolCalls =
            existing >= 0
              ? state.active.toolCalls.map((call, index) =>
                  index === existing ? event.toolCall : call
                )
              : [...state.active.toolCalls, event.toolCall];
          return { active: { ...state.active, toolCalls } };
        });
        break;
      }
      case 'chat.task': {
        set((state) => {
          if (!state.active || state.active.requestId !== event.requestId) return {};
          return { active: { ...state.active, task: event.task } };
        });
        break;
      }
      case 'chat.permission': {
        set({ pendingPermission: event.request });
        break;
      }
      case 'chat.memory': {
        set({ memoryNotice: event.memory });
        break;
      }
      case 'chat.done': {
        const active = get().active;
        set((state) => ({
          streaming: false,
          submitting: false,
          active: state.active ? { ...state.active, finished: true } : null
        }));
        if (active) {
          void (async () => {
            await refreshConversation(set, get, active.conversationId);
            await get().loadConversations();
            if (get().active?.requestId === active.requestId) {
              set({ active: null });
            }
          })();
        }
        break;
      }
      case 'chat.error': {
        set({
          streaming: false,
          submitting: false,
          error: event.error.message,
          pendingPermission: null
        });
        break;
      }
      case 'chat.cancelled': {
        const active = get().active;
        set({
          streaming: false,
          submitting: false,
          notice: '已停止当前回复',
          pendingPermission: null,
          active: null
        });
        if (active) {
          void refreshConversation(set, get, active.conversationId);
        }
        break;
      }
      default:
        break;
    }
  },

  clearError() {
    set({ error: null });
  },
  clearNotice() {
    set({ notice: null });
  },
  clearMemoryNotice() {
    set({ memoryNotice: null });
  }
}));
