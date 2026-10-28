import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { createModelProvider } from './provider';
import type { LlmMessage, ResolvedModelConfig } from './types';

let server: Server;
let baseUrl = '';

function sseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function completionChunk(model: string, delta: unknown, finishReason: string | null = null): string {
  return sseChunk({
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }]
  });
}

beforeAll(async () => {
  server = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      raw += chunk;
    });
    request.on('end', () => {
      const body = raw ? (JSON.parse(raw) as { model?: string }) : {};
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      });

      if (body.model === 'mock-tool') {
        response.write(
          completionChunk('mock-tool', {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                index: 0,
                id: 'call_test',
                type: 'function',
                function: { name: 'read_file', arguments: '{"path":"' }
              }
            ]
          })
        );
        response.write(
          completionChunk('mock-tool', {
            tool_calls: [
              {
                index: 0,
                function: { arguments: 'C:\\\\test.txt"}' }
              }
            ]
          })
        );
        response.write(completionChunk('mock-tool', {}, 'tool_calls'));
        response.end('data: [DONE]\n\n');
        return;
      }

      response.write(completionChunk('mock-text', { role: 'assistant', content: 'Hello' }));
      response.write(completionChunk('mock-text', { content: ' from local model' }));
      response.write(completionChunk('mock-text', {}, 'stop'));
      response.write(
        sseChunk({
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'mock-text',
          choices: [],
          usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 }
        })
      );
      response.end('data: [DONE]\n\n');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function config(model: string): ResolvedModelConfig {
  return {
    id: 'test',
    name: 'Local test',
    kind: 'openai-compatible',
    purpose: 'general',
    model,
    baseUrl,
    apiKey: 'test-key',
    temperature: 0,
    maxTokens: 128
  };
}

describe('AiSdkModelProvider', () => {
  it('streams text and usage from an OpenAI-compatible endpoint', async () => {
    const provider = createModelProvider(config('mock-text'));
    const messages: LlmMessage[] = [{ role: 'user', content: 'Hi' }];
    let text = '';
    let usage = 0;
    for await (const event of provider.stream(messages)) {
      if (event.type === 'text-delta') text += event.delta;
      if (event.type === 'finish') usage = event.usage.totalTokens;
      if (event.type === 'error') throw event.error;
    }
    expect(text).toBe('Hello from local model');
    expect(usage).toBe(12);
  });

  it('returns a concatenated chat response', async () => {
    const provider = createModelProvider(config('mock-text'));
    const response = await provider.chat([{ role: 'user', content: 'Hello' }]);
    expect(response.text).toBe('Hello from local model');
    expect(response.aborted).toBe(false);
  });

  it('parses streamed tool calls', async () => {
    const provider = createModelProvider(config('mock-tool'));
    const events = [];
    for await (const event of provider.stream([{ role: 'user', content: 'Read it' }], {
      tools: [
        {
          name: 'read_file',
          description: 'Read a file',
          inputSchema: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }
      ]
    })) {
      events.push(event);
      if (event.type === 'error') throw event.error;
    }
    const toolCall = events.find((event) => event.type === 'tool-call');
    expect(toolCall?.type).toBe('tool-call');
    if (toolCall?.type === 'tool-call') {
      expect(toolCall.toolCall.name).toBe('read_file');
      expect(toolCall.toolCall.input).toEqual({ path: 'C:\\test.txt' });
    }
  });
});
