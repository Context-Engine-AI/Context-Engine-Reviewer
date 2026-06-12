import { AISDKProvider } from '../providers/ai-sdk';
import config from '../config';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
}));

// Mock AI SDK generation helpers.
const mockGenerateObject = jest.fn();
const mockGenerateText = jest.fn();
const mockOutputObject = jest.fn((options: any) => ({ kind: 'object-output', ...options }));
const mockStepCountIs = jest.fn((count: number) => ({ kind: 'step-count', count }));
jest.mock('ai', () => ({
  generateObject: (...args: any[]) => (mockGenerateObject as any)(...args),
  generateText: (...args: any[]) => (mockGenerateText as any)(...args),
  Output: { object: (...args: any[]) => (mockOutputObject as any)(...args) },
  stepCountIs: (...args: any[]) => (mockStepCountIs as any)(...args),
}));

const mockCreateContextEngineTools = jest.fn().mockResolvedValue(undefined);
const mockAppendContextEngineToolInstructions = jest.fn((system?: string) => `${system || ''}\nCE tools enabled`);
const mockLogContextEngineToolUsage = jest.fn();
jest.mock('../context_engine_mcp', () => ({
  createContextEngineTools: (...args: any[]) => (mockCreateContextEngineTools as any)(...args),
  appendContextEngineToolInstructions: (...args: any[]) => (mockAppendContextEngineToolInstructions as any)(...args),
  logContextEngineToolUsage: (...args: any[]) => (mockLogContextEngineToolUsage as any)(...args),
}));

describe('AISDKProvider', () => {
  const originalDebug = process.env.DEBUG;

  beforeEach(() => {
    jest.resetAllMocks();
    mockCreateContextEngineTools.mockResolvedValue(undefined);
    mockAppendContextEngineToolInstructions.mockImplementation((system?: string) => `${system || ''}\nCE tools enabled`);
    mockOutputObject.mockImplementation((options: any) => ({ kind: 'object-output', ...options }));
    mockStepCountIs.mockImplementation((count: number) => ({ kind: 'step-count', count }));
    delete process.env.DEBUG;
  });

  afterAll(() => {
    process.env.DEBUG = originalDebug;
  });

  function makeCreateAiFunc(spy: { calls: any[] }) {
    // createAiFunc({ apiKey }) => llm(modelName) => modelRef
    return ({ apiKey }: { apiKey: string }) => {
      spy.calls.push({ apiKey });
      return (modelName: string) => ({ provider: 'ai-sdk', modelName });
    };
  }

  test('passes config API key to createAiFunc and calls generateObject with defaults', async () => {
    const calls: any[] = [];
    const createAiFunc = makeCreateAiFunc({ calls });

    // Arrange generateObject to return object + usage
    mockGenerateObject.mockResolvedValue({
      object: { ok: true, value: 42 },
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const provider = new AISDKProvider(createAiFunc as any, 'gpt-4o-mini');

    const result = await provider.runInference({
      prompt: 'Hello',
      temperature: undefined as any,
      system: 'sys',
      schema: { type: 'object' } as any,
    });

    // createAiFunc received API key from config
    expect(calls[0]).toEqual({ apiKey: (config as any).llmApiKey });

    // generateObject called with correct params
    expect(mockCreateContextEngineTools).not.toHaveBeenCalled();
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    const args = mockGenerateObject.mock.calls[0][0];
    expect(args.prompt).toBe('Hello');
    expect(args.system).toBe('sys');
    expect(args.schema).toEqual({ type: 'object' });
    expect(args.temperature).toBe(0); // defaulted
    expect(args.model).toEqual({ provider: 'ai-sdk', modelName: 'gpt-4o-mini' });
    expect(typeof args.experimental_repairText).toBe('function');
    expect(args.providerOptions).toEqual({ openai: { strictJsonSchema: false } });
    expect(args.maxOutputTokens).toBe(16384);
    await expect(args.experimental_repairText({ text: '```json\n{"ok":true}\n```', error: new Error('parse') })).resolves.toBe('{"ok":true}');

    // returns the parsed object
    expect(result).toEqual({ ok: true, value: 42 });
  });

  test('uses provided temperature and logs usage in DEBUG mode', async () => {
    process.env.DEBUG = '1';
    const { info } = require('@actions/core');

    const calls: any[] = [];
    const createAiFunc = makeCreateAiFunc({ calls });

    mockGenerateObject.mockResolvedValue({
      object: { ok: true },
      usage: { inputTokens: 1, outputTokens: 2 },
    });

    const provider = new AISDKProvider(createAiFunc as any, 'anthropic/claude-3-haiku');

    await provider.runInference({
      prompt: 'P',
      temperature: 0.7,
      system: 'S',
      schema: { type: 'object' } as any,
    });

    const args = mockGenerateObject.mock.calls[0][0];
    expect(args.temperature).toBe(0.7);

    // info called with usage JSON when DEBUG set
    expect(info).toHaveBeenCalled();
    const msg = (info as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(msg).toContain('usage:');
  });

  test('propagates errors from generateObject', async () => {
    const calls: any[] = [];
    const createAiFunc = makeCreateAiFunc({ calls });

    mockGenerateObject.mockRejectedValue(new Error('upstream failure'));

    const provider = new AISDKProvider(createAiFunc as any, 'google/gemini-1.5-pro');

    await expect(
      provider.runInference({
        prompt: 'X',
        temperature: undefined as any,
        system: '',
        schema: { type: 'object' } as any,
      })
    ).rejects.toThrow('upstream failure');
  });

  test('uses tool-loop structured output when Context Engine MCP tools are enabled', async () => {
    const calls: any[] = [];
    const createAiFunc = makeCreateAiFunc({ calls });
    const tools = { search: { type: 'function' } };
    mockCreateContextEngineTools.mockResolvedValue(tools);
    mockGenerateText.mockResolvedValue({
      output: { ok: true, reviewed: true },
      totalUsage: { inputTokens: 11, outputTokens: 22 },
    });

    const provider = new AISDKProvider(createAiFunc as any, 'gpt-4o-mini');
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } } } as any;

    const result = await provider.runInference({
      prompt: 'Review this diff',
      temperature: undefined as any,
      system: 'sys',
      schema,
      enableContextEngineTools: true,
    });

    expect(result).toEqual({ ok: true, reviewed: true });
    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const args = mockGenerateText.mock.calls[0][0];
    expect(args.prompt).toBe('Review this diff');
    expect(args.system).toContain('CE tools enabled');
    expect(args.tools).toBe(tools);
    expect(args.stopWhen).toEqual({ kind: 'step-count', count: 8 });
    expect(args.output).toEqual({ kind: 'object-output', schema });
    expect(args.providerOptions).toEqual({ openai: { strictJsonSchema: false } });
    expect(mockLogContextEngineToolUsage).toHaveBeenCalledTimes(1);
  });

  test('falls back to diff-only structured output when tool-loop parsing fails', async () => {
    const calls: any[] = [];
    const createAiFunc = makeCreateAiFunc({ calls });
    mockCreateContextEngineTools.mockResolvedValue({ search: { type: 'function' } });
    const parseError = new Error('could not parse');
    (parseError as any).name = 'AI_NoObjectGeneratedError';
    mockGenerateText.mockRejectedValue(parseError);
    mockGenerateObject.mockResolvedValue({ object: { ok: true }, usage: {} });

    const provider = new AISDKProvider(createAiFunc as any, 'gpt-4o-mini');

    const result = await provider.runInference({
      prompt: 'Review this diff',
      temperature: undefined as any,
      system: 'sys',
      schema: { type: 'object' } as any,
      enableContextEngineTools: true,
    });

    expect(result).toEqual({ ok: true });
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockLogContextEngineToolUsage).toHaveBeenCalledTimes(1);
  });

  test('maps configured reasoning effort to provider options', async () => {
    const calls: any[] = [];
    const createAiFunc = makeCreateAiFunc({ calls });
    mockGenerateObject.mockResolvedValue({ object: { ok: true }, usage: {} });
    (config as any).llmReasoningEffort = 'high';

    try {
      const provider = new AISDKProvider(createAiFunc as any, 'gpt-5.4-mini');
      await provider.runInference({
        prompt: 'P',
        temperature: undefined as any,
        system: 'S',
        schema: { type: 'object' } as any,
      });

      const args = mockGenerateObject.mock.calls[0][0];
      expect(args.providerOptions.openai).toEqual({ strictJsonSchema: false, reasoningEffort: 'high' });
      expect(args.providerOptions.anthropic).toEqual({ effort: 'high' });
      expect(args.providerOptions.zai).toEqual({ reasoningEffort: 'high' });
      expect(args.providerOptions.kimi).toEqual({ reasoningEffort: 'high' });
    } finally {
      (config as any).llmReasoningEffort = undefined;
    }
  });

  test('pins Claude Fable to medium effort regardless of configuration', async () => {
    const calls: any[] = [];
    const createAiFunc = makeCreateAiFunc({ calls });
    mockGenerateObject.mockResolvedValue({ object: { ok: true }, usage: {} });
    (config as any).llmReasoningEffort = 'high';

    try {
      const provider = new AISDKProvider(createAiFunc as any, 'claude-fable-5');
      await provider.runInference({
        prompt: 'P',
        temperature: undefined as any,
        system: 'S',
        schema: { type: 'object' } as any,
      });

      const args = mockGenerateObject.mock.calls[0][0];
      expect(args.providerOptions.anthropic).toEqual({ effort: 'medium' });
    } finally {
      (config as any).llmReasoningEffort = undefined;
    }
  });

  test('pins Claude Fable to medium effort even with no effort configured', async () => {
    const calls: any[] = [];
    const createAiFunc = makeCreateAiFunc({ calls });
    mockGenerateObject.mockResolvedValue({ object: { ok: true }, usage: {} });

    const provider = new AISDKProvider(createAiFunc as any, 'claude-fable-5');
    await provider.runInference({
      prompt: 'P',
      temperature: undefined as any,
      system: 'S',
      schema: { type: 'object' } as any,
    });

    const args = mockGenerateObject.mock.calls[0][0];
    expect(args.providerOptions.anthropic).toEqual({ effort: 'medium' });
    expect(args.providerOptions.zai).toBeUndefined();
  });

  test('repairs structurally broken JSON via jsonrepair', async () => {
    const calls: any[] = [];
    const createAiFunc = makeCreateAiFunc({ calls });
    mockGenerateObject.mockResolvedValue({ object: { ok: true }, usage: {} });

    const provider = new AISDKProvider(createAiFunc as any, 'gpt-4o-mini');
    await provider.runInference({
      prompt: 'P',
      temperature: undefined as any,
      system: 'S',
      schema: { type: 'object' } as any,
    });

    const args = mockGenerateObject.mock.calls[0][0];
    const repaired = await args.experimental_repairText({ text: '{"a": [1 2]}', error: new Error('parse') });
    expect(JSON.parse(repaired)).toEqual({ a: [1, 2] });
  });

  test('honors configured Context Engine max steps and logs usage on failure', async () => {
    const calls: any[] = [];
    const createAiFunc = makeCreateAiFunc({ calls });
    mockCreateContextEngineTools.mockResolvedValue({ search: { type: 'function' } });
    mockGenerateText.mockRejectedValue(new Error('inference failed'));
    (config as any).contextEngineMaxSteps = 12;

    const provider = new AISDKProvider(createAiFunc as any, 'gpt-4o-mini');

    try {
      await expect(
        provider.runInference({
          prompt: 'Review this diff',
          temperature: undefined as any,
          system: 'sys',
          schema: { type: 'object' } as any,
          enableContextEngineTools: true,
        })
      ).rejects.toThrow('inference failed');

      expect(mockStepCountIs).toHaveBeenCalledWith(12);
      expect(mockLogContextEngineToolUsage).toHaveBeenCalledTimes(1);
    } finally {
      (config as any).contextEngineMaxSteps = 8;
    }
  });
});
