import { safeStorage } from 'electron';
import type { SecretsStore } from '@zbot/database';

export class SecretService {
  constructor(private readonly secrets: SecretsStore) {}

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  encrypt(plaintext: string): string {
    if (!this.isAvailable()) {
      throw new Error(
        'Windows 安全存储当前不可用，Z Bot 拒绝以明文保存密钥。请检查系统凭据服务后重试。'
      );
    }
    return safeStorage.encryptString(plaintext).toString('base64');
  }

  decrypt(ciphertext: string): string {
    if (!this.isAvailable()) {
      throw new Error('Windows 安全存储当前不可用，无法读取已保存的 API Key');
    }
    try {
      return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'));
    } catch {
      throw new Error('API Key 解密失败。请在 Settings 中重新输入密钥。');
    }
  }

  getEncrypted(name: string): string | null {
    return this.secrets.get(name);
  }

  setEncrypted(name: string, encrypted: string): void {
    this.secrets.set(name, encrypted);
  }

  delete(name: string): void {
    this.secrets.delete(name);
  }

  setPlaintext(name: string, value: string): void {
    this.setEncrypted(name, this.encrypt(value));
  }

  getPlaintext(name: string): string | null {
    const encrypted = this.getEncrypted(name);
    return encrypted ? this.decrypt(encrypted) : null;
  }
}
