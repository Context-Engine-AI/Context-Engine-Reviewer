import { z } from 'zod';

// We'll re-import runPrompt under different config mocks to hit branches

describe('ai.runPrompt', () => {
  const schema = z.object({ ok: z.boolean().default(true) });

  const isolate = async (configMock: any, providersMock?: any) => {
    jest.resetModules();
    jest.doMock('../config', () => ({ __esModule: true, default: configMock }));
    if (providersMock?.ai) {
      jest.doMock('../providers/ai-sdk', () => providersMock.ai);
    }
    const mod = await import('../ai');
    return mod;
  };

  test('throws on unknown provider', async () => {
    const { runPrompt } = await isolate({ llmProvider: 'nope', llmModel: 'gpt-4o-mini' });
    await expect(
      runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any })
    ).rejects.toThrow(/Unknown LLM provider/i);
  });

  test('throws on unknown model for valid provider', async () => {
    const { runPrompt } = await isolate({ llmProvider: 'ai-sdk', llmModel: 'no-such-model' });
    await expect(
      runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any })
    ).rejects.toThrow(/Unknown LLM model/i);
  });

  test('uses AI SDK provider and passes model temperature', async () => {
    const runInference = jest.fn().mockResolvedValue({ ok: 1 });
    const { runPrompt } = await isolate(
      { llmProvider: 'ai-sdk', llmModel: 'o3-mini' },
      {
        ai: {
          __esModule: true,
          AISDKProvider: class {
            constructor(public _create: any, public _name: string) {}
            runInference = runInference;
          }
        }
      }
    );
    const res = await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(res).toEqual({ ok: 1 });
    // o3-mini in ai.ts has temperature: 1
    expect(runInference).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1 }));
  });

  test('accepts Z.AI glm-5 model through AI SDK provider', async () => {
    const runInference = jest.fn().mockResolvedValue({ ok: 1 });
    const constructors: any[] = [];
    const { runPrompt } = await isolate(
      { llmProvider: 'ai-sdk', llmModel: 'glm-5' },
      {
        ai: {
          __esModule: true,
          AISDKProvider: class {
            constructor(public _create: any, public _name: string) {
              constructors.push({ create: _create, name: _name });
            }
            runInference = runInference;
          }
        }
      }
    );
    await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(constructors[0].name).toBe('glm-5');
    expect(runInference).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1 }));
  });

  const isolateWithRecorder = async (llmModel: string) => {
    const runInference = jest.fn().mockResolvedValue({ ok: 1 });
    const constructors: any[] = [];
    const { runPrompt } = await isolate(
      { llmProvider: 'ai-sdk', llmModel },
      {
        ai: {
          __esModule: true,
          AISDKProvider: class {
            constructor(public _create: any, public _name: string) {
              constructors.push({ create: _create, name: _name });
            }
            runInference = runInference;
          }
        }
      }
    );
    return { runPrompt, runInference, constructors };
  };

  test('infers Anthropic provider for unlisted claude models', async () => {
    const { runPrompt, runInference, constructors } = await isolateWithRecorder('claude-sonnet-4-5');
    await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(constructors[0].name).toBe('claude-sonnet-4-5');
    expect(runInference).toHaveBeenCalledWith(expect.objectContaining({ temperature: undefined }));
  });

  test('infers OpenAI provider with temperature 1 for unlisted gpt models', async () => {
    const { runPrompt, runInference, constructors } = await isolateWithRecorder('gpt-5.2');
    await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(constructors[0].name).toBe('gpt-5.2');
    expect(runInference).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1 }));
  });

  test('infers Bedrock provider for unlisted inference profile ids', async () => {
    const { runPrompt, constructors } = await isolateWithRecorder('eu.anthropic.claude-sonnet-4-5-20250929-v1:0');
    await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(constructors[0].name).toBe('eu.anthropic.claude-sonnet-4-5-20250929-v1:0');
  });

  test('infers Google provider for unlisted gemini models', async () => {
    const { runPrompt, constructors } = await isolateWithRecorder('gemini-3.0-pro');
    await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(constructors[0].name).toBe('gemini-3.0-pro');
  });

  test('routes kimi-k2.7-code through the Kimi provider with temperature 1', async () => {
    const { runPrompt, runInference, constructors } = await isolateWithRecorder('kimi-k2.7-code');
    await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(constructors[0].name).toBe('kimi-k2.7-code');
    expect(runInference).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1 }));
  });

  test('infers Kimi provider for unlisted kimi and moonshot models', async () => {
    const { runPrompt, runInference, constructors } = await isolateWithRecorder('moonshot-v1-128k');
    await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(constructors[0].name).toBe('moonshot-v1-128k');
    expect(runInference).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1 }));
  });

  test('routes deepseek-chat through the DeepSeek provider', async () => {
    const { runPrompt, constructors } = await isolateWithRecorder('deepseek-chat');
    await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(constructors[0].name).toBe('deepseek-chat');
  });

  test('infers DeepSeek provider for unlisted deepseek models', async () => {
    const { runPrompt, constructors } = await isolateWithRecorder('deepseek-v4');
    await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(constructors[0].name).toBe('deepseek-v4');
  });

  test('does not misroute o-prefixed non-OpenAI model names', async () => {
    const { runPrompt } = await isolateWithRecorder('oracle-1');
    await expect(
      runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any })
    ).rejects.toThrow(/Unknown LLM model/i);
  });

  test('infers OpenAI provider for bare o-series ids', async () => {
    const { runPrompt, runInference, constructors } = await isolateWithRecorder('o5-mini');
    await runPrompt({ prompt: 'p', systemPrompt: 's', schema: schema as any });
    expect(constructors[0].name).toBe('o5-mini');
    expect(runInference).toHaveBeenCalledWith(expect.objectContaining({ temperature: 1 }));
  });

});
