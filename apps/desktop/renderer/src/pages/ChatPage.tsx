import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowUp,
  ImagePlus,
  LoaderCircle,
  MessageSquare,
  Paperclip,
  Plus,
  Square,
  Trash2,
  X
} from 'lucide-react';
import type { Message, Task } from '@zbot/shared';
import { MarkdownView } from '../components/MarkdownView';
import { StatusBadge } from '../components/StatusBadge';
import { TaskSteps } from '../components/TaskSteps';
import { ToolCallCard } from '../components/ToolCallCard';
import { useChatStore } from '../stores/chatStore';
import { fileToAttachment } from '../lib/files';
import { formatBytes, formatRelative } from '../lib/format';
import { cn } from '../lib/cn';

function AttachmentView({ message }: { message: Message }): React.JSX.Element | null {
  if (message.attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {message.attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]"
        >
          {attachment.kind === 'image' ? (
            <img
              src={attachment.url}
              alt={attachment.name}
              className="max-h-52 max-w-[300px] object-cover"
            />
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-[var(--muted-strong)]">
              <Paperclip className="size-3.5" />
              {attachment.name} · {formatBytes(attachment.size)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MessageRow({
  message,
  streamingContent,
  streaming
}: {
  message: Message;
  streamingContent?: string;
  streaming?: boolean;
}): React.JSX.Element {
  const isUser = message.role === 'user';
  const content = streamingContent !== undefined ? streamingContent : message.content;
  if (!content && !isUser && !streaming) return <></>;
  return (
    <article className={cn('py-5', isUser ? 'pl-10 sm:pl-24' : 'pr-6 sm:pr-14')}>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {isUser ? 'You' : 'Z Bot'}
        </span>
        <span className="text-[9px] text-[var(--muted-faint)]">
          {formatRelative(message.createdAt)}
        </span>
      </div>
      {content ? (
        isUser ? (
          <div className="inline-block max-w-full rounded-[14px] rounded-tl-[4px] bg-[var(--accent-soft)] px-4 py-3 text-[13px] leading-6 text-[var(--ink)]">
            <div className="whitespace-pre-wrap">{content}</div>
          </div>
        ) : (
          <MarkdownView>{content}</MarkdownView>
        )
      ) : (
        <div className="flex items-center gap-1.5 py-1 text-[var(--muted)]" role="status">
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
          <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
          <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
          <span className="sr-only">正在生成回复</span>
        </div>
      )}
      <AttachmentView message={message} />
    </article>
  );
}

function ActiveWork({ task }: { task: Task | null }): React.JSX.Element | null {
  if (!task) return null;
  return (
    <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold">任务进度</span>
        <span className="font-mono text-[9px] text-[var(--muted)]">{task.steps.length} STEPS</span>
      </div>
      <TaskSteps task={task} compact />
    </div>
  );
}

export function ChatPage(): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const {
    conversations,
    currentConversationId,
    messages,
    loadingConversation,
    submitting,
    streaming,
    active,
    pendingAttachments,
    error,
    notice,
    loadConversations,
    openConversation,
    newChat,
    send,
    cancel,
    addAttachment,
    removeAttachment,
    clearError,
    clearNotice
  } = useChatStore();

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const id = params.get('conversation');
    if (id) {
      if (id !== currentConversationId || messages.length === 0) void openConversation(id);
    }
  }, [params, currentConversationId, messages.length, openConversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [messages, active?.draft, active?.toolCalls, active?.task]);

  const currentConversation = conversations.find(
    (conversation) => conversation.id === currentConversationId
  );
  const currentActive = active?.conversationId === currentConversationId ? active : null;
  const draftAssistantId = currentActive?.assistantMessageId;

  const activeTools = currentActive?.toolCalls ?? [];
  const visibleMessages = useMemo(() => messages, [messages]);

  const chooseConversation = (id: string): void => {
    setParams({ conversation: id });
    void openConversation(id);
  };

  const startNew = (): void => {
    if (streaming) return;
    newChat();
    setParams({});
    setText('');
    composerRef.current?.focus();
  };

  const removeConversation = async (): Promise<void> => {
    if (!currentConversationId) return;
    if (!window.confirm('删除这段对话？长期记忆不会被删除。')) return;
    try {
      await window.zbot.conversations.remove(currentConversationId);
      newChat();
      setParams({});
      await loadConversations();
    } catch (removeError) {
      useChatStore.setState({
        error: removeError instanceof Error ? removeError.message : String(removeError)
      });
    }
  };

  const submit = async (): Promise<void> => {
    if (streaming || submitting) return;
    const ok = await send(text);
    if (ok) {
      setText('');
      composerRef.current?.focus();
    }
  };

  const addFiles = async (files: FileList | File[]): Promise<void> => {
    for (const file of Array.from(files).slice(0, 6)) {
      try {
        const { input, previewUrl } = await fileToAttachment(file);
        addAttachment(input, previewUrl);
      } catch (fileError) {
        useChatStore.setState({
          error: fileError instanceof Error ? fileError.message : String(fileError)
        });
      }
    }
  };

  const empty = !currentConversationId && messages.length === 0;

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-[var(--line)] bg-[color-mix(in_oklch,var(--paper-deep)_55%,transparent)]">
        <div className="flex h-[76px] items-center justify-between px-4">
          <div>
            <div className="page-kicker">Conversation</div>
            <div className="mt-1 text-[13px] font-semibold">History</div>
          </div>
          <button
            type="button"
            onClick={startNew}
            disabled={streaming}
            className="grid size-9 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted-strong)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] disabled:opacity-40"
            aria-label="新对话"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => chooseConversation(conversation.id)}
              className={cn(
                'mb-0.5 flex min-h-[52px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
                conversation.id === currentConversationId
                  ? 'bg-[var(--nav-active)]'
                  : 'hover:bg-[var(--nav-hover)]'
              )}
            >
              <MessageSquare className="size-3.5 shrink-0 text-[var(--muted)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium">{conversation.title}</span>
                <span className="mt-0.5 block text-[9px] text-[var(--muted)]">
                  {formatRelative(conversation.updatedAt)}
                </span>
              </span>
            </button>
          ))}
          {conversations.length === 0 ? (
            <p className="px-3 py-4 text-[11px] leading-5 text-[var(--muted)]">
              对话会保存在本地。从一个问题开始。
            </p>
          ) : null}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="drag-region flex h-[76px] shrink-0 items-center justify-between border-b border-[var(--line)] px-7">
          <div className="min-w-0">
            <div className="page-kicker">Chat</div>
            <h1 className="mt-1 truncate font-display text-[18px] font-semibold tracking-[-0.02em]">
              {currentConversation?.title ?? '新对话'}
            </h1>
          </div>
          <div className="no-drag flex items-center gap-2">
            {streaming ? (
              <StatusBadge tone="accent">
                <LoaderCircle className="size-3 animate-spin" />
                正在回复
              </StatusBadge>
            ) : null}
            {currentConversationId ? (
              <button
                type="button"
                onClick={() => void removeConversation()}
                className="grid size-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                aria-label="删除对话"
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[820px] px-7">
            {error ? (
              <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-[color-mix(in_oklch,var(--danger)_30%,var(--line))] bg-[var(--danger-soft)] px-4 py-3 text-[12px] text-[var(--danger)]">
                <span>{error}</span>
                <button type="button" onClick={clearError} aria-label="关闭错误">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : null}
            {notice ? (
              <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--nav-hover)] px-4 py-3 text-[12px] text-[var(--muted-strong)]">
                <span>{notice}</span>
                <button type="button" onClick={clearNotice} aria-label="关闭提示">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : null}

            {loadingConversation ? (
              <div className="flex min-h-[220px] items-center justify-center text-[var(--muted)]">
                <LoaderCircle className="size-5 animate-spin" />
              </div>
            ) : empty ? (
              <div className="flex min-h-[calc(100vh-250px)] flex-col items-center justify-center py-16 text-center">
                <div className="empty-mark mx-auto">
                  <ImagePlus className="size-[18px]" />
                </div>
                <h2 className="mt-5 font-display text-[25px] font-semibold tracking-[-0.03em]">
                  你想做什么？
                </h2>
                <p className="mt-2 max-w-[54ch] text-[13px] leading-6 text-[var(--muted-strong)]">
                  可以让我记住一件事、查找过去的上下文、整理授权目录，或者只是问一个问题。
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {[
                    '记住我喜欢简洁直接的界面',
                    '我之前说过什么？',
                    '看看 Downloads 里有什么',
                    '明天上午 10 点提醒我检查发布'
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setText(suggestion);
                        composerRef.current?.focus();
                      }}
                      className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[11px] text-[var(--muted-strong)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)] pb-4">
                {visibleMessages.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    streamingContent={
                      message.id === draftAssistantId ? currentActive?.draft : undefined
                    }
                    streaming={message.id === draftAssistantId && streaming}
                  />
                ))}
                {activeTools.length > 0 ? (
                  <div className="space-y-2 py-4">
                    {activeTools.map((tool) => (
                      <ToolCallCard key={tool.id} toolCall={tool} />
                    ))}
                  </div>
                ) : null}
                {currentActive?.task ? <ActiveWork task={currentActive.task} /> : null}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--line)] bg-[color-mix(in_oklch,var(--paper)_75%,transparent)] px-7 py-4 backdrop-blur">
          <div
            className={cn(
              'mx-auto w-full max-w-[820px] rounded-2xl border bg-[var(--surface)] p-2 transition-colors',
              dragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)]'
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
            }}
          >
            {pendingAttachments.length > 0 ? (
              <div className="flex flex-wrap gap-2 px-2 pb-2 pt-1">
                {pendingAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="group relative flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--paper-deep)] p-1.5 pr-7"
                  >
                    {attachment.previewUrl ? (
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.name}
                        className="size-10 rounded object-cover"
                      />
                    ) : (
                      <div className="grid size-10 place-items-center rounded bg-[var(--surface)] text-[var(--muted)]">
                        <Paperclip className="size-4" />
                      </div>
                    )}
                    <div className="max-w-[140px]">
                      <div className="truncate text-[10px] font-medium">{attachment.name}</div>
                      <div className="text-[9px] text-[var(--muted)]">
                        {formatBytes(attachment.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="absolute right-1 top-1 grid size-5 place-items-center rounded text-[var(--muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]"
                      aria-label={`移除 ${attachment.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]"
                aria-label="添加附件"
              >
                <Paperclip className="size-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,text/plain,application/json,application/pdf"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) void addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <textarea
                ref={composerRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onPaste={(event) => {
                  const files = Array.from(event.clipboardData.items)
                    .filter((item) => item.kind === 'file')
                    .map((item) => item.getAsFile())
                    .filter((file): file is File => Boolean(file));
                  if (files.length > 0) {
                    event.preventDefault();
                    void addFiles(files);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                rows={1}
                placeholder={streaming ? 'Z Bot 正在回复…' : '输入消息…'}
                aria-label="消息"
                disabled={streaming}
                className="max-h-[180px] min-h-[42px] flex-1 resize-none bg-transparent py-2 text-[14px] leading-6 outline-none placeholder:text-[var(--muted-faint)] disabled:opacity-55"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={() => void cancel()}
                  className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--nav-hover)] hover:text-[var(--ink)]"
                  aria-label="停止生成"
                >
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={(!text.trim() && pendingAttachments.length === 0) || submitting}
                  className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-opacity disabled:opacity-35"
                  aria-label="发送消息"
                >
                  {submitting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </button>
              )}
            </div>
          </div>
          <p className="mx-auto mt-2 max-w-[820px] text-[10px] text-[var(--muted)]">
            附件与网页内容会被视为不可信数据 · Enter 发送，Shift+Enter 换行
          </p>
        </div>
      </section>
    </div>
  );
}
