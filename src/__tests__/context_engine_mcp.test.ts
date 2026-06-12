import config from '../config';
import {
  ContextEngineMcpClient,
  appendContextEngineToolInstructions,
  createContextEngineTools,
  logContextEngineToolUsage,
  resetContextEngineToolsCache,
} from '../context_engine_mcp';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  getInput: jest.fn(() => ''),
  getMultilineInput: jest.fn(() => []),
}));

describe('Context Engine MCP integration', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    resetContextEngineToolsCache();
    (config as any).contextEngineApiKey = 'ce-key';
    (config as any).contextEngineMcpUrl = 'https://dev.context-engine.ai/indexer/mcp';
    (config as any).contextEngineCollection = 'repo-collection';
    (config as any).contextEngineTools = ['repo_search', 'batch_search'];
    (config as any).contextEngineMaxTools = 10;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function jsonResponse(body: unknown, headers?: Record<string, string>): Response {
    return new Response(JSON.stringify(body), { status: 200, headers });
  }

  test('lists remote MCP tools with bearer auth and session reuse', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { tools: [{ name: 'search', description: 'Search code' }] } }));
    global.fetch = fetchMock as any;

    const client = new ContextEngineMcpClient({
      url: 'https://dev.context-engine.ai/indexer/mcp',
      apiKey: 'ce-key',
      collection: 'repo-collection',
    });

    const tools = await client.listTools();

    expect(tools).toEqual([{ name: 'search', description: 'Search code' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer ce-key');
    expect(fetchMock.mock.calls[0][1].headers['x-collection']).toBe('repo-collection');
    expect(fetchMock.mock.calls[2][1].headers['mcp-session-id']).toBe('session-1');
  });

  test('tool calls add reviewer-safe compact defaults and collection', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { content: [{ type: 'text', text: 'ok' }] } }));
    global.fetch = fetchMock as any;

    const client = new ContextEngineMcpClient({
      url: 'https://dev.context-engine.ai/indexer/mcp',
      apiKey: 'ce-key',
      collection: 'repo-collection',
    });

    await client.callTool('repo_search', { query: 'authentication' });

    const callBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(callBody.method).toBe('tools/call');
    expect(callBody.params.name).toBe('repo_search');
    expect(callBody.params.arguments).toEqual(expect.objectContaining({
      query: 'authentication',
      collection: 'repo-collection',
      limit: 5,
      compact: true,
      include_snippet: true,
      output_format: 'toon',
    }));
  });

  test('creates AI SDK tools from the configured remote MCP allow-list', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { tools: [
        { name: 'search', description: 'Noisy router', inputSchema: { type: 'object' } },
        { name: 'repo_search', description: 'Search code', inputSchema: { type: 'object' } },
        { name: 'batch_search', description: 'Batch search code', inputSchema: { type: 'object' } },
        { name: 'memory_store', description: 'Do not expose by default', inputSchema: { type: 'object' } },
      ] } }));
    global.fetch = fetchMock as any;

    const tools = await createContextEngineTools();

    expect(Object.keys(tools || {})).toEqual(['repo_search', 'batch_search']);
  });

  test('default allow-list excludes unified search router and memory tools', async () => {
    (config as any).contextEngineTools = [];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { tools: [
        { name: 'search', description: 'Noisy router', inputSchema: { type: 'object' } },
        { name: 'repo_search', description: 'Repo search', inputSchema: { type: 'object' } },
        { name: 'batch_search', description: 'Batch repo search', inputSchema: { type: 'object' } },
        { name: 'symbol_graph', description: 'Symbol graph', inputSchema: { type: 'object' } },
        { name: 'batch_symbol_graph', description: 'Batch symbol graph', inputSchema: { type: 'object' } },
        { name: 'graph_query', description: 'Graph query', inputSchema: { type: 'object' } },
        { name: 'batch_graph_query', description: 'Batch graph query', inputSchema: { type: 'object' } },
        { name: 'search_tests_for', description: 'Tests', inputSchema: { type: 'object' } },
        { name: 'search_config_for', description: 'Config', inputSchema: { type: 'object' } },
        { name: 'search_commits_for', description: 'Git history', inputSchema: { type: 'object' } },
        { name: 'context_answer', description: 'Grounded answers', inputSchema: { type: 'object' } },
        { name: 'memory_find', description: 'Memory', inputSchema: { type: 'object' } },
      ] } }));
    global.fetch = fetchMock as any;

    const tools = await createContextEngineTools();

    expect(Object.keys(tools || {})).toEqual([
      'repo_search',
      'batch_search',
      'symbol_graph',
      'batch_symbol_graph',
      'graph_query',
      'batch_graph_query',
      'search_tests_for',
      'search_config_for',
      'search_commits_for',
      'context_answer',
    ]);
  });

  test('does not add snippet defaults to graph tools', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { content: [{ type: 'text', text: 'ok' }] } }));
    global.fetch = fetchMock as any;

    const client = new ContextEngineMcpClient({
      url: 'https://dev.context-engine.ai/indexer/mcp',
      apiKey: 'ce-key',
      collection: 'repo-collection',
    });

    await client.callTool('symbol_graph', { symbol: 'authenticate', query_type: 'callers' });

    const callBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(callBody.params.arguments).toEqual(expect.objectContaining({
      symbol: 'authenticate',
      query_type: 'callers',
      collection: 'repo-collection',
      limit: 5,
      output_format: 'toon',
    }));
    expect(callBody.params.arguments).not.toHaveProperty('compact');
    expect(callBody.params.arguments).not.toHaveProperty('include_snippet');
  });

  test('does not add output-format defaults to git history tools', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { content: [{ type: 'text', text: 'ok' }] } }));
    global.fetch = fetchMock as any;

    const client = new ContextEngineMcpClient({
      url: 'https://dev.context-engine.ai/indexer/mcp',
      apiKey: 'ce-key',
      collection: 'repo-collection',
    });

    await client.callTool('search_commits_for', { query: 'authentication bug' });

    const callBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(callBody.params.arguments).toEqual(expect.objectContaining({
      query: 'authentication bug',
      collection: 'repo-collection',
      limit: 5,
    }));
    expect(callBody.params.arguments).not.toHaveProperty('output_format');
    expect(callBody.params.arguments).not.toHaveProperty('include_snippet');
  });

  test('does not alter system prompt when Context Engine is not configured', () => {
    (config as any).contextEngineApiKey = undefined;
    expect(appendContextEngineToolInstructions('sys')).toBe('sys');
  });

  test('returns compact text content instead of the full MCP envelope', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: {
        content: [{ type: 'text', text: 'toon-results' }],
        structuredContent: { results: [{ path: 'a.ts' }] },
      } }));
    global.fetch = fetchMock as any;

    const client = new ContextEngineMcpClient({
      url: 'https://dev.context-engine.ai/indexer/mcp',
      apiKey: 'ce-key',
    });

    await expect(client.callTool('repo_search', { query: 'auth' })).resolves.toBe('toon-results');
  });

  test('falls back to structuredContent when no text content is present', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { structuredContent: { results: [{ path: 'a.ts' }] } } }));
    global.fetch = fetchMock as any;

    const client = new ContextEngineMcpClient({
      url: 'https://dev.context-engine.ai/indexer/mcp',
      apiKey: 'ce-key',
    });

    await expect(client.callTool('repo_search', { query: 'auth' }))
      .resolves.toEqual({ results: [{ path: 'a.ts' }] });
  });

  test('context_answer gets collection and limit but no output-format defaults', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { content: [{ type: 'text', text: 'answer' }] } }));
    global.fetch = fetchMock as any;

    const client = new ContextEngineMcpClient({
      url: 'https://dev.context-engine.ai/indexer/mcp',
      apiKey: 'ce-key',
      collection: 'repo-collection',
    });

    await client.callTool('context_answer', { query: 'how is auth enforced?' });

    const callBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(callBody.params.arguments).toEqual(expect.objectContaining({
      query: 'how is auth enforced?',
      collection: 'repo-collection',
      limit: 5,
    }));
    expect(callBody.params.arguments).not.toHaveProperty('output_format');
    expect(callBody.params.arguments).not.toHaveProperty('compact');
    expect(callBody.params.arguments).not.toHaveProperty('include_snippet');
  });

  test('attaches an abort signal to MCP requests', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { tools: [] } }));
    global.fetch = fetchMock as any;

    const client = new ContextEngineMcpClient({
      url: 'https://dev.context-engine.ai/indexer/mcp',
      apiKey: 'ce-key',
    });
    await client.listTools();

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test('caches tool discovery across review batches', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { tools: [
        { name: 'repo_search', description: 'Search code', inputSchema: { type: 'object' } },
      ] } }));
    global.fetch = fetchMock as any;

    const first = await createContextEngineTools();
    const second = await createContextEngineTools();

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('fails open to diff-only review when MCP setup fails', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as any;

    await expect(createContextEngineTools()).resolves.toBeUndefined();
    // Cached failure: later batches stay diff-only without re-fetching.
    await expect(createContextEngineTools()).resolves.toBeUndefined();
  });

  test('does not report tools dropped only by the max-tools cap as missing', async () => {
    const { warning } = require('@actions/core');
    (config as any).contextEngineMaxTools = 1;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { tools: [
        { name: 'repo_search', description: 'Search code', inputSchema: { type: 'object' } },
        { name: 'batch_search', description: 'Batch search', inputSchema: { type: 'object' } },
      ] } }));
    global.fetch = fetchMock as any;

    const tools = await createContextEngineTools();

    expect(Object.keys(tools || {})).toEqual(['repo_search']);
    expect((warning as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('\n')).not.toContain('not exposed');
  });

  test('tool execute returns a structured error instead of throwing', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { tools: [
        { name: 'repo_search', description: 'Search code', inputSchema: { type: 'object' } },
      ] } }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }));
    global.fetch = fetchMock as any;

    const tools = await createContextEngineTools();
    const result = await (tools as any).repo_search.execute({ query: 'auth' }, {} as any);

    expect(result).toEqual({ error: expect.stringContaining('HTTP 500') });
  });

  test('logs a one-line tool usage summary and resets counters', async () => {
    const { info } = require('@actions/core');
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ result: {} }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ result: { tools: [
        { name: 'repo_search', description: 'Search code', inputSchema: { type: 'object' } },
      ] } }))
      .mockResolvedValueOnce(jsonResponse({ result: { content: [{ type: 'text', text: 'ok' }] } }));
    global.fetch = fetchMock as any;

    const tools = await createContextEngineTools();
    await (tools as any).repo_search.execute({ query: 'auth' }, {} as any);

    logContextEngineToolUsage();
    logContextEngineToolUsage();

    const messages = (info as jest.Mock).mock.calls.map((call: any[]) => call[0]);
    expect(messages.some((m: string) => /\[context-engine\] tool usage: repo_search x1 \(avg \d+ms\)/.test(m))).toBe(true);
    expect(messages.some((m: string) => m.includes('no Context Engine tool calls'))).toBe(true);
  });
});