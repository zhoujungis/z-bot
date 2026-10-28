import type { Memory, MemoryInput, MemorySearchInput, MemoryType } from '@zbot/shared';
import type { MemoryStore } from '@zbot/database';

export interface RememberResult {
  memory: Memory;
  created: boolean;
}

export interface MemoryService {
  remember(input: MemoryInput): RememberResult;
  search(input: MemorySearchInput): Memory[];
  recentForContext(limit?: number): Memory[];
  forget(id: string): void;
  forgetMatching(query: string, limit?: number): number;
  clear(): void;
  cleanExpired(): number;
  formatForPrompt(memories: Memory[]): string;
  extractExplicitMemory(text: string): string | null;
}

const EXPLICIT_MEMORY_PATTERNS = [
  /^(?:请|帮我|麻烦)?记住[：:，,\s]*(.+)$/s,
  /^(?:请|帮我|麻烦)?记一下[：:，,\s]*(.+)$/s,
  /^remember(?: that)?[：:,\s]+(.+)$/is,
  /^please remember(?: that)?[：:,\s]+(.+)$/is
];

export class LocalMemoryService implements MemoryService {
  constructor(private readonly store: MemoryStore) {}

  remember(input: MemoryInput): RememberResult {
    const duplicate = this.store.findDuplicate(
      input.content,
      input.type,
      input.projectId ?? null
    );
    if (duplicate) {
      const memory = this.store.upsert({
        ...input,
        id: duplicate.id,
        importance: Math.max(duplicate.importance, input.importance),
        confidence: Math.max(duplicate.confidence, input.confidence),
        tags: [...duplicate.tags, ...(input.tags ?? [])]
      });
      return { memory, created: false };
    }
    return { memory: this.store.upsert(input), created: true };
  }

  search(input: MemorySearchInput): Memory[] {
    return this.store.search(input);
  }

  recentForContext(limit = 8): Memory[] {
    const important = this.store.list({ limit, includeArchived: false });
    const seen = new Set<string>();
    return important.filter((memory) => {
      if (seen.has(memory.id)) return false;
      seen.add(memory.id);
      return true;
    });
  }

  forget(id: string): void {
    this.store.delete(id);
  }

  forgetMatching(query: string, limit = 1): number {
    const matches = this.store.search({ query, limit });
    for (const memory of matches) this.store.delete(memory.id);
    return matches.length;
  }

  clear(): void {
    this.store.clear();
  }

  cleanExpired(): number {
    return this.store.archiveExpired();
  }

  extractExplicitMemory(text: string): string | null {
    const trimmed = text.trim();
    for (const pattern of EXPLICIT_MEMORY_PATTERNS) {
      const match = trimmed.match(pattern);
      const value = match?.[1]?.trim();
      if (value) return value;
    }
    return null;
  }

  formatForPrompt(memories: Memory[]): string {
    if (memories.length === 0) return '';
    return memories
      .map((memory) => {
        const project = memory.projectId ? ` project=${memory.projectId}` : '';
        const tags = memory.tags.length > 0 ? ` tags=${memory.tags.join(',')}` : '';
        return `- [${memory.type}${project}${tags}] ${memory.content}`;
      })
      .join('\n');
  }
}

export function memoryTypeForText(text: string): MemoryType {
  if (/项目|project/i.test(text)) return 'project';
  return 'user';
}
