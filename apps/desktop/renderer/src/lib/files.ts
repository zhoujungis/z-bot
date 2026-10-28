import type { AttachmentInput } from '@zbot/shared';

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/json',
  'application/pdf'
]);

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export async function fileToAttachment(file: File): Promise<{
  input: AttachmentInput;
  previewUrl: string | null;
}> {
  if (file.size > MAX_BYTES) throw new Error('附件不能超过 25 MB');
  const mimeType = file.type || 'application/octet-stream';
  if (!ALLOWED_TYPES.has(mimeType)) {
    throw new Error('仅支持 PNG/JPEG/WebP/GIF、文本、JSON 和 PDF 文件');
  }
  const dataUrl = await readAsDataUrl(file);
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('文件读取失败');
  const dataBase64 = dataUrl.slice(comma + 1);
  const kind = mimeType.startsWith('image/') ? 'image' : 'file';
  return {
    input: {
      name: file.name || `attachment-${Date.now()}`,
      mimeType,
      dataBase64,
      kind
    },
    previewUrl: kind === 'image' ? dataUrl : null
  };
}

export function base64Preview(
  dataBase64: string,
  mimeType: string,
  kind: 'image' | 'file'
): string | null {
  return kind === 'image' ? `data:${mimeType};base64,${dataBase64}` : null;
}
