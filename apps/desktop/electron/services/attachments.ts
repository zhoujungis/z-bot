import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createId } from '@zbot/shared';
import type { Attachment, AttachmentInput } from '@zbot/shared';
import type { StoredAttachment } from '@zbot/database';
import type { LlmImage } from '@zbot/model';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'text/plain': 'txt',
  'application/json': 'json',
  'application/pdf': 'pdf'
};

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface SavedAttachment {
  stored: StoredAttachment;
  attachment: Attachment;
  image?: LlmImage;
}

export class AttachmentService {
  constructor(private readonly directory: string) {}

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  async save(input: AttachmentInput): Promise<SavedAttachment> {
    if (!MIME_EXTENSIONS[input.mimeType]) {
      throw new Error(`不支持的文件类型：${input.mimeType}`);
    }
    const buffer = Buffer.from(input.dataBase64, 'base64');
    if (buffer.length === 0) throw new Error('附件内容为空');
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error('附件超过 25 MB 限制');
    }

    const id = createId();
    const extension = MIME_EXTENSIONS[input.mimeType]!;
    const filePath = join(this.directory, `${id}.${extension}`);
    await mkdir(this.directory, { recursive: true });
    await writeFile(filePath, buffer, { flag: 'wx' });
    const attachment: Attachment = {
      id,
      name: input.name,
      mimeType: input.mimeType,
      size: buffer.length,
      kind: input.kind,
      url: `zbot-media://attachment/${id}`
    };
    return {
      stored: {
        id,
        name: input.name,
        mimeType: input.mimeType,
        size: buffer.length,
        kind: input.kind,
        filePath
      },
      attachment,
      image:
        input.kind === 'image'
          ? { mimeType: input.mimeType, dataBase64: buffer.toString('base64') }
          : undefined
    };
  }

  async resolve(id: string): Promise<{ path: string; mimeType: string } | null> {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) return null;
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch {
      return null;
    }
    for (const [mimeType, extension] of Object.entries(MIME_EXTENSIONS)) {
      const expected = `${id}.${extension}`;
      if (files.includes(expected)) {
        return { path: join(this.directory, expected), mimeType };
      }
    }
    return null;
  }

  async read(id: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const resolved = await this.resolve(id);
    if (!resolved) return null;
    return { data: await readFile(resolved.path), mimeType: resolved.mimeType };
  }
}
