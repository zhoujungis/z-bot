import { z } from 'zod';
import {
  permissionSpec,
  type BotTool
} from '../types';

export const getClipboardTool: BotTool = {
  name: 'get_clipboard',
  label: '读取剪贴板',
  description:
    'Read text from the Windows clipboard. Requires explicit confirmation. Clipboard contents are not persisted automatically.',
  inputSchema: z.object({
    maxChars: z.number().int().min(1).max(100_000).optional().default(20_000)
  }),
  async getPermission() {
    return permissionSpec({
      level: 'system',
      risk: 'high',
      requiresConfirmation: true,
      scope: 'clipboard',
      title: '读取剪贴板',
      description: '剪贴板可能包含密码、令牌或其他敏感内容'
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as { maxChars: number };
    const text = await deps.system.readClipboardText();
    const truncated = text.length > args.maxChars;
    return {
      ok: true,
      summary: text ? '已读取剪贴板文本' : '剪贴板没有文本',
      content: `Trust: UNTRUSTED_DATA\n\n${text.slice(0, args.maxChars)}`,
      data: { length: text.length, truncated },
      untrusted: true
    };
  }
};

export const captureScreenTool: BotTool = {
  name: 'capture_screen',
  label: '截取屏幕',
  description:
    'Capture the current screen as an image so the user can discuss it. Requires explicit confirmation.',
  inputSchema: z.object({
    reason: z.string().max(500).optional()
  }),
  async getPermission(input) {
    const args = this.inputSchema.parse(input) as { reason?: string };
    return permissionSpec({
      level: 'system',
      risk: 'high',
      requiresConfirmation: true,
      scope: 'screen',
      title: '截取屏幕',
      description: args.reason || '截图可能包含屏幕上的敏感信息'
    });
  },
  async execute(input, deps) {
    const args = this.inputSchema.parse(input) as { reason?: string };
    const attachment = await deps.system.captureScreen();
    return {
      ok: true,
      summary: '屏幕截图已保存',
      content: `Screenshot saved: ${attachment.name}${args.reason ? ` (${args.reason})` : ''}`,
      attachment,
      untrusted: true
    };
  }
};
