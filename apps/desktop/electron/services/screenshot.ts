import { desktopCapturer, screen } from 'electron';
import type { Attachment, AttachmentInput } from '@zbot/shared';
import type { AttachmentService } from './attachments';

export async function captureScreenInput(
  attachments: AttachmentService
): Promise<{ input: AttachmentInput; attachment: Attachment }> {
  const display = screen.getPrimaryDisplay();
  const width = Math.max(1, Math.round(display.size.width * display.scaleFactor));
  const height = Math.max(1, Math.round(display.size.height * display.scaleFactor));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
    fetchWindowIcons: false
  });
  const source =
    sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0];
  if (!source) throw new Error('无法获取屏幕截图源');
  const png = source.thumbnail.toPNG();
  if (png.length === 0) throw new Error('屏幕截图内容为空');
  const input: AttachmentInput = {
    name: `screen-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
    mimeType: 'image/png',
    dataBase64: png.toString('base64'),
    kind: 'image'
  };
  const saved = await attachments.save(input);
  return { input, attachment: saved.attachment };
}
