import { BrowserRuntime } from './browser-runtime';
import {
  copyFileTool,
  createDirectoryTool,
  listDirectoryTool,
  moveFileTool,
  moveFilesTool,
  readFileTool,
  searchFilesTool,
  trashFileTool,
  writeFileTool
} from './tools/files';
import { createBrowserTools } from './tools/browser';
import {
  createReminderTool,
  createTodoTool,
  forgetMemoryTool,
  rememberTool,
  searchMemoryTool
} from './tools/personal';
import { captureScreenTool, getClipboardTool } from './tools/system';
import { webFetchTool, webSearchTool } from './tools/web';
import {
  jsonSchemaFor,
  type BotTool,
  type ToolDependencies,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolPermissionSpec,
  type ToolResult
} from './types';

export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Unknown tool: ${name}`);
    this.name = 'ToolNotFoundError';
  }
}

export class ToolRegistry {
  private readonly browser = new BrowserRuntime();
  private readonly tools = new Map<string, BotTool>();

  constructor(private readonly deps: ToolDependencies) {
    const all: BotTool[] = [
      listDirectoryTool,
      readFileTool,
      searchFilesTool,
      createDirectoryTool,
      writeFileTool,
      copyFileTool,
      moveFileTool,
      moveFilesTool,
      trashFileTool,
      webSearchTool,
      webFetchTool,
      ...createBrowserTools(this.browser),
      rememberTool,
      searchMemoryTool,
      forgetMemoryTool,
      createTodoTool,
      createReminderTool,
      getClipboardTool,
      captureScreenTool
    ];
    for (const tool of all) {
      if (this.tools.has(tool.name)) {
        throw new Error(`Duplicate tool name: ${tool.name}`);
      }
      this.tools.set(tool.name, tool);
    }
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: jsonSchemaFor(tool)
    }));
  }

  list(): BotTool[] {
    return [...this.tools.values()];
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): BotTool {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolNotFoundError(name);
    return tool;
  }

  label(name: string): string {
    return this.tools.get(name)?.label ?? name;
  }

  async permission(name: string, input: unknown): Promise<ToolPermissionSpec> {
    return this.get(name).getPermission(input, this.deps);
  }

  async execute(
    name: string,
    input: unknown,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.get(name);
    return tool.execute(input, this.deps, context);
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}
