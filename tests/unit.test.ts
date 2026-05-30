import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Chain definitions ---
describe('chains', () => {
  it('exports SKALE Base Mainnet config', async () => {
    const { SKALE_BASE_MAINNET } = await import('../src/chains.js');
    expect(SKALE_BASE_MAINNET.id).toBe(1187947933);
    expect(SKALE_BASE_MAINNET.network).toBe('eip155:1187947933');
    expect(SKALE_BASE_MAINNET.rpcUrl).toContain('skalenodes.com');
  });

  it('exports SKALE Base Sepolia config', async () => {
    const { SKALE_BASE_SEPOLIA } = await import('../src/chains.js');
    expect(SKALE_BASE_SEPOLIA.id).toBe(324705682);
    expect(SKALE_BASE_SEPOLIA.network).toBe('eip155:324705682');
    expect(SKALE_BASE_SEPOLIA.faucet).toBeDefined();
  });

  it('exports ERC-8004 registry addresses for both networks', async () => {
    const { ERC8004_REGISTRIES } = await import('../src/chains.js');
    expect(ERC8004_REGISTRIES.mainnet.identity).toMatch(/^0x8004/);
    expect(ERC8004_REGISTRIES.mainnet.reputation).toMatch(/^0x8004/);
    expect(ERC8004_REGISTRIES.testnet.identity).toMatch(/^0x8004/);
    expect(ERC8004_REGISTRIES.testnet.reputation).toMatch(/^0x8004/);
  });

  it('exports USDC token addresses', async () => {
    const { TOKENS } = await import('../src/chains.js');
    expect(TOKENS.mainnet.USDC.decimals).toBe(6);
    expect(TOKENS.testnet.USDC.decimals).toBe(6);
  });
});

// --- Server ---
describe('createServer', () => {
  it('creates a Hono app with required routes', async () => {
    const { createServer } = await import('../src/server/server.js');
    const app = createServer({
      apiKey: 'test-key',
      receivingAddress: '0x1234567890abcdef1234567890abcdef12345678',
    });
    expect(app).toBeDefined();
    // Hono app has fetch method
    expect(typeof app.fetch).toBe('function');
  });

  it('GET /status returns health info', async () => {
    const { createServer } = await import('../src/server/server.js');
    const app = createServer({
      apiKey: 'test-key',
      receivingAddress: '0x1234567890abcdef1234567890abcdef12345678',
      sentinelUrl: 'http://sentinel.test',
      rvUrl: 'http://rv.test',
    });

    // Mock fetch for backend health checks
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('mocked'));

    const res = await app.fetch(new Request('http://localhost/status'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('version', '0.1.0');
    expect(body).toHaveProperty('sentinel');
    expect(body).toHaveProperty('rv');
    expect(body).toHaveProperty('uptime_seconds');

    global.fetch = originalFetch;
  });

  it('GET /discover returns service info with pricing', async () => {
    const { createServer } = await import('../src/server/server.js');
    const app = createServer({
      apiKey: 'test-key',
      receivingAddress: '0xABCD',
    });

    const res = await app.fetch(new Request('http://localhost/discover'));
    const body = await res.json() as Record<string, any>;

    expect(res.status).toBe(200);
    expect(body.agent).toBe('ThoughtProof Verification Agent');
    expect(body.endpoints.sentinel.price).toBe('3000');
    expect(body.endpoints.verify.price.standard).toBe('20000');
    expect(body.endpoints.verify.price.deep).toBe('80000');
    expect(body.paymentInfo.protocol).toBe('x402');
    expect(body.paymentInfo.payTo).toBe('0xABCD');
  });

  it('POST /sentinel validates required fields', async () => {
    const { createServer } = await import('../src/server/server.js');
    const app = createServer({
      apiKey: 'test-key',
      receivingAddress: '0xABCD',
    });

    const res = await app.fetch(new Request('http://localhost/sentinel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }));

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, any>;
    expect(body.error).toContain('action');
  });

  it('POST /verify validates required fields', async () => {
    const { createServer } = await import('../src/server/server.js');
    const app = createServer({
      apiKey: 'test-key',
      receivingAddress: '0xABCD',
    });

    const res = await app.fetch(new Request('http://localhost/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }));

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, any>;
    expect(body.error).toContain('claim');
  });

  it('POST /sentinel proxies to backend on valid request', async () => {
    const { createServer } = await import('../src/server/server.js');
    const app = createServer({
      apiKey: 'test-key',
      receivingAddress: '0xABCD',
      sentinelUrl: 'http://sentinel.test',
    });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        verdict: 'ALLOW',
        confidence: 0.95,
        risk_score: 0.1,
        reason: 'Low risk action',
        flags: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const res = await app.fetch(new Request('http://localhost/sentinel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read price data' }),
    }));

    const body = await res.json() as Record<string, any>;
    expect(res.status).toBe(200);
    expect(body.verdict).toBe('ALLOW');
    expect(body.confidence).toBe(0.95);
    expect(body.latency_ms).toBeGreaterThanOrEqual(0);

    // Verify it called the right backend
    expect(global.fetch).toHaveBeenCalledWith(
      'http://sentinel.test/sentinel/verify',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key',
        }),
      }),
    );

    global.fetch = originalFetch;
  });

  it('POST /verify proxies to RV backend', async () => {
    const { createServer } = await import('../src/server/server.js');
    const app = createServer({
      apiKey: 'test-key',
      receivingAddress: '0xABCD',
      rvUrl: 'http://rv.test',
    });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        verdict: 'BLOCK',
        confidence: 0.88,
        summary: 'Claim contains factual errors',
        objections: [{ claim: 'price wrong', severity: 'high', explanation: 'Outdated data' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const res = await app.fetch(new Request('http://localhost/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim: 'ETH is at $10k', tier: 'deep' }),
    }));

    const body = await res.json() as Record<string, any>;
    expect(res.status).toBe(200);
    expect(body.verdict).toBe('BLOCK');
    expect(body.objections).toHaveLength(1);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://rv.test/verify',
      expect.objectContaining({ method: 'POST' }),
    );

    global.fetch = originalFetch;
  });

  it('handles backend errors gracefully', async () => {
    const { createServer } = await import('../src/server/server.js');
    const app = createServer({
      apiKey: 'test-key',
      receivingAddress: '0xABCD',
      sentinelUrl: 'http://sentinel.test',
    });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 })
    );

    const res = await app.fetch(new Request('http://localhost/sentinel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test' }),
    }));

    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, any>;
    expect(body.error).toBe('Sentinel backend error');

    global.fetch = originalFetch;
  });
});

// --- buildPaymentRoutes ---
describe('buildPaymentRoutes', () => {
  it('returns x402 routes for sentinel and verify', async () => {
    const { buildPaymentRoutes } = await import('../src/server/server.js');
    const routes = buildPaymentRoutes({
      apiKey: 'test',
      receivingAddress: '0xABCD',
    });

    expect(routes).toHaveProperty('POST /sentinel');
    expect(routes).toHaveProperty('POST /verify');
    expect(routes['POST /sentinel'].accepts[0].scheme).toBe('exact');
    expect(routes['POST /sentinel'].accepts[0].payTo).toBe('0xABCD');
    expect(routes['POST /sentinel'].accepts[0].price.amount).toBe('3000');
    expect(routes['POST /verify'].accepts[0].price.amount).toBe('20000');
  });

  it('uses testnet token for testnet network', async () => {
    const { buildPaymentRoutes } = await import('../src/server/server.js');
    const { SKALE_BASE_SEPOLIA, TOKENS } = await import('../src/chains.js');
    const routes = buildPaymentRoutes({
      apiKey: 'test',
      receivingAddress: '0xABCD',
      network: SKALE_BASE_SEPOLIA.network,
    });

    expect(routes['POST /sentinel'].accepts[0].price.asset).toBe(TOKENS.testnet.USDC.address);
  });

  it('allows custom pricing', async () => {
    const { buildPaymentRoutes } = await import('../src/server/server.js');
    const routes = buildPaymentRoutes({
      apiKey: 'test',
      receivingAddress: '0xABCD',
      sentinelPrice: '5000',
      rvStandardPrice: '50000',
    });

    expect(routes['POST /sentinel'].accepts[0].price.amount).toBe('5000');
    expect(routes['POST /verify'].accepts[0].price.amount).toBe('50000');
  });
});

// --- Client ---
describe('ThoughtProofClient', () => {
  it('constructs with config', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({
      serverUrl: 'http://localhost:3000',
    });
    expect(client).toBeDefined();
  });

  it('calls /status without payment', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({ serverUrl: 'http://test' });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'ok', version: '0.1.0', sentinel: true, rv: true, uptime_seconds: 100,
      }))
    );

    const status = await client.status();
    expect(status.status).toBe('ok');
    expect(global.fetch).toHaveBeenCalledWith('http://test/status');

    global.fetch = originalFetch;
  });

  it('calls /discover without payment', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({ serverUrl: 'http://test' });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ agent: 'ThoughtProof' }))
    );

    const info = await client.discover();
    expect(info.agent).toBe('ThoughtProof');

    global.fetch = originalFetch;
  });

  it('sentinel() sends POST to /sentinel', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({ serverUrl: 'http://test' });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        verdict: 'ALLOW', confidence: 0.9, risk_score: 0.1, reason: 'ok', flags: [], latency_ms: 50,
      }))
    );

    const result = await client.sentinel({ action: 'test' });
    expect(result.verdict).toBe('ALLOW');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://test/sentinel',
      expect.objectContaining({ method: 'POST' }),
    );

    global.fetch = originalFetch;
  });

  it('verify() sends POST to /verify', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({ serverUrl: 'http://test' });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        verdict: 'BLOCK', confidence: 0.85, summary: 'Wrong', objections: [], latency_ms: 200,
      }))
    );

    const result = await client.verify({ claim: 'test claim', tier: 'deep' });
    expect(result.verdict).toBe('BLOCK');

    global.fetch = originalFetch;
  });

  it('pipeline() runs sentinel only when BLOCK', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({ serverUrl: 'http://test' });

    let callCount = 0;
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(new Response(JSON.stringify({
        verdict: 'BLOCK', confidence: 0.95, risk_score: 0.9,
        reason: 'Dangerous', flags: ['high_risk'], latency_ms: 30,
      })));
    });

    const result = await client.pipeline({
      action: 'dangerous action',
      claim: 'this should not run',
    });

    expect(result.finalVerdict).toBe('BLOCK');
    expect(result.rv).toBeUndefined();
    expect(callCount).toBe(1); // Only sentinel called

    global.fetch = originalFetch;
  });

  it('pipeline() runs both sentinel + rv when ALLOW', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({ serverUrl: 'http://test' });

    let callCount = 0;
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (String(url).includes('/sentinel')) {
        return Promise.resolve(new Response(JSON.stringify({
          verdict: 'ALLOW', confidence: 0.9, risk_score: 0.1,
          reason: 'ok', flags: [], latency_ms: 30,
        })));
      }
      return Promise.resolve(new Response(JSON.stringify({
        verdict: 'ALLOW', confidence: 0.85, summary: 'Verified',
        objections: [], latency_ms: 200,
      })));
    });

    const result = await client.pipeline({
      action: 'safe action',
      claim: 'claim to verify',
    });

    expect(result.finalVerdict).toBe('ALLOW');
    expect(result.rv).toBeDefined();
    expect(result.rv!.verdict).toBe('ALLOW');
    expect(callCount).toBe(2);

    global.fetch = originalFetch;
  });

  it('pipeline() conservative merge: RV BLOCK overrides Sentinel ALLOW', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({ serverUrl: 'http://test' });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/sentinel')) {
        return Promise.resolve(new Response(JSON.stringify({
          verdict: 'ALLOW', confidence: 0.9, risk_score: 0.1,
          reason: 'ok', flags: [], latency_ms: 30,
        })));
      }
      return Promise.resolve(new Response(JSON.stringify({
        verdict: 'BLOCK', confidence: 0.88, summary: 'Factually wrong',
        objections: [{ claim: 'err', severity: 'high', explanation: 'Wrong' }],
        latency_ms: 200,
      })));
    });

    const result = await client.pipeline({
      action: 'action',
      claim: 'bad claim',
    });

    expect(result.sentinel.verdict).toBe('ALLOW');
    expect(result.rv!.verdict).toBe('BLOCK');
    expect(result.finalVerdict).toBe('BLOCK');

    global.fetch = originalFetch;
  });

  it('pipeline() conservative merge: UNCERTAIN propagates', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({ serverUrl: 'http://test' });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/sentinel')) {
        return Promise.resolve(new Response(JSON.stringify({
          verdict: 'UNCERTAIN', confidence: 0.5, risk_score: 0.5,
          reason: 'unclear', flags: [], latency_ms: 30,
        })));
      }
      return Promise.resolve(new Response(JSON.stringify({
        verdict: 'ALLOW', confidence: 0.8, summary: 'ok',
        objections: [], latency_ms: 200,
      })));
    });

    const result = await client.pipeline({
      action: 'action',
      claim: 'claim',
    });

    expect(result.finalVerdict).toBe('UNCERTAIN');

    global.fetch = originalFetch;
  });

  it('throws on non-ok responses', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({ serverUrl: 'http://test' });

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response('Not found', { status: 404 })
    );

    await expect(client.sentinel({ action: 'test' })).rejects.toThrow('404');

    global.fetch = originalFetch;
  });

  it('initPayments() throws without private key', async () => {
    const { ThoughtProofClient } = await import('../src/client/client.js');
    const client = new ThoughtProofClient({ serverUrl: 'http://test' });

    await expect(client.initPayments()).rejects.toThrow('privateKey required');
  });
});

// --- ERC-8004 Client ---
describe('ERC8004Client', () => {
  it('generates deterministic agent IDs', async () => {
    const { ERC8004Client } = await import('../src/erc8004/erc8004.js');
    const client = new ERC8004Client({
      privateKey: '0x' + '1'.repeat(64),
      testnet: true,
    });

    const id1 = client.agentId('ThoughtProof Verification Agent');
    const id2 = client.agentId('ThoughtProof Verification Agent');
    const id3 = client.agentId('Different Agent');

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('exposes wallet address', async () => {
    const { ERC8004Client } = await import('../src/erc8004/erc8004.js');
    const client = new ERC8004Client({
      privateKey: '0x' + '1'.repeat(64),
      testnet: true,
    });

    expect(client.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('uses testnet config when testnet=true', async () => {
    const { ERC8004Client } = await import('../src/erc8004/erc8004.js');
    const client = new ERC8004Client({
      privateKey: '0x' + '1'.repeat(64),
      testnet: true,
    });

    expect(client.chain.id).toBe(324705682);
    expect(client.chain.name).toBe('SKALE Base Sepolia');
  });

  it('uses mainnet config by default', async () => {
    const { ERC8004Client } = await import('../src/erc8004/erc8004.js');
    const client = new ERC8004Client({
      privateKey: '0x' + '1'.repeat(64),
    });

    expect(client.chain.id).toBe(1187947933);
    expect(client.chain.name).toBe('SKALE Base');
  });
});

// --- Root exports ---
describe('root exports', () => {
  it('exports all public API', async () => {
    const mod = await import('../src/index.js');
    expect(mod.SKALE_BASE_MAINNET).toBeDefined();
    expect(mod.SKALE_BASE_SEPOLIA).toBeDefined();
    expect(mod.ERC8004_REGISTRIES).toBeDefined();
    expect(mod.TOKENS).toBeDefined();
    expect(mod.createServer).toBeTypeOf('function');
    expect(mod.buildPaymentRoutes).toBeTypeOf('function');
    expect(mod.ThoughtProofClient).toBeTypeOf('function');
    expect(mod.ERC8004Client).toBeTypeOf('function');
  });
});
