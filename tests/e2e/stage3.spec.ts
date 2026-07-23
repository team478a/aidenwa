import { expect, test } from '@playwright/test';

test('Stage 3 publishes configuration and safely executes deterministic mock campaigns', async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const login = await page.request.post('/backend/auth/login', {
    data: { email: 'admin@example.local', password: 'Stage1-E2E-Admin!' },
  });
  expect(login.ok()).toBeTruthy();
  const cookies = [
    ...(login.headers()['set-cookie'] ?? '').matchAll(/(sales_ai_(?:session|csrf))=([^;,]+)/g),
  ].map(([, name, value]) => ({ name, value, url: 'http://127.0.0.1:3000' }));
  await page.context().addCookies(cookies);
  const headers = {
    'x-csrf-token': decodeURIComponent(
      cookies.find((c) => c.name === 'sales_ai_csrf')?.value ?? '',
    ),
  };
  const post = async <T>(path: string, data: unknown = {}) => {
    const r = await page.request.post(`/backend${path}`, { headers, data });
    expect(r.ok(), `${path}: ${await r.text()}`).toBeTruthy();
    return r.json() as Promise<T>;
  };
  const put = async <T>(path: string, data: unknown) => {
    const r = await page.request.put(`/backend${path}`, { headers, data });
    expect(r.ok(), `${path}: ${await r.text()}`).toBeTruthy();
    return r.json() as Promise<T>;
  };

  const product = await post<{ product: { id: string } }>('/products', {
    name: `商材 ${suffix}`,
    code: `P-${suffix}`,
  });
  const pv = await post<{ productVersion: { id: string } }>(
    `/products/${product.product.id}/versions`,
    { summary: '安全な模擬商材', targetCustomer: '法人', requiredDisclosures: ['AI模擬'] },
  );
  await post(`/product-versions/${pv.productVersion.id}/publish`);
  const agent = await post<{ aiAgent: { id: string } }>('/ai-agents', { name: `AI担当 ${suffix}` });
  const av = await post<{ aiAgentVersion: { id: string } }>(
    `/ai-agents/${agent.aiAgent.id}/versions`,
    {
      displayName: 'Leadmark AI',
      aiDisclosure: 'AIによる模擬応対です',
      recordingDisclosure: '',
      fallbackMessage: '確認できません',
      closingMessage: 'ありがとうございました',
    },
  );
  await post(`/ai-agent-versions/${av.aiAgentVersion.id}/publish`);

  const scenario = await post<{ scenario: { id: string } }>('/scenarios', {
    name: `シナリオ ${suffix}`,
    purpose: '安全な模擬',
  });
  const sv = await post<{ scenarioVersion: { id: string } }>(
    `/scenarios/${scenario.scenario.id}/versions`,
  );
  await put(`/scenario-versions/${sv.scenarioVersion.id}/graph`, {
    nodes: [{ nodeKey: 'bad', nodeType: 'start', title: 'bad' }],
    edges: [],
  });
  const invalid = await page.request.post(
    `/backend/scenario-versions/${sv.scenarioVersion.id}/publish`,
    { headers, data: {} },
  );
  expect(invalid.status()).toBe(409);
  await put(`/scenario-versions/${sv.scenarioVersion.id}/graph`, {
    nodes: [
      { nodeKey: 'start', nodeType: 'start', title: '開始' },
      {
        nodeKey: 'listen',
        nodeType: 'listen',
        title: '確認',
        messageTemplate: '{{company.name}}様',
      },
      { nodeKey: 'opt', nodeType: 'opt_out', title: '停止' },
      { nodeKey: 'end', nodeType: 'end', title: '終了' },
    ],
    edges: [
      { fromNodeKey: 'start', toNodeKey: 'listen', conditionType: 'default', priority: 1 },
      {
        fromNodeKey: 'listen',
        toNodeKey: 'opt',
        conditionType: 'intent',
        conditionValue: 'opt_out',
        priority: 999,
      },
      { fromNodeKey: 'listen', toNodeKey: 'end', conditionType: 'default', priority: 100 },
      { fromNodeKey: 'opt', toNodeKey: 'end', conditionType: 'default', priority: 1 },
    ],
  });
  await post(`/scenario-versions/${sv.scenarioVersion.id}/validate`);
  await post(`/scenario-versions/${sv.scenarioVersion.id}/publish`);
  const simulation = await post<{ path: string[] }>(
    `/scenario-versions/${sv.scenarioVersion.id}/simulate`,
    { intents: ['default', 'opt_out', 'default'] },
  );
  expect(simulation.path).toContain('opt');

  const kb = await post<{ knowledgeBase: { id: string } }>('/knowledge-bases', {
    name: `FAQ ${suffix}`,
  });
  const doc = await post<{ knowledgeDocument: { id: string } }>(
    `/knowledge-bases/${kb.knowledgeBase.id}/documents`,
    { title: '料金FAQ', sourceType: 'faq' },
  );
  const entry = await post<{ knowledgeEntry: { id: string } }>(
    `/knowledge-documents/${doc.knowledgeDocument.id}/entries`,
    { question: '料金は？', answer: '公開料金をご案内します', keywords: ['料金'] },
  );
  const draftSearch = await post<{ results: unknown[] }>(
    `/knowledge-bases/${kb.knowledgeBase.id}/search`,
    { query: '料金' },
  );
  expect(draftSearch.results).toHaveLength(0);
  await post(`/knowledge-documents/${doc.knowledgeDocument.id}/publish`);
  const publishedSearch = await post<{ results: Array<{ entryId: string }> }>(
    `/knowledge-bases/${kb.knowledgeBase.id}/search`,
    { query: '料金' },
  );
  expect(publishedSearch.results[0]?.entryId).toBe(entry.knowledgeEntry.id);

  const list = await post<{ salesList: { id: string } }>('/sales-lists', {
    name: `Stage3 List ${suffix}`,
    listType: 'static',
    filterConditions: {},
  });
  const companyIds: string[] = [];
  const phoneSeed = Number(suffix.slice(-4)) % 1000;
  for (const [index, type] of ['representative', 'representative', 'fax'].entries()) {
    const c = await post<{ company: { id: string } }>('/companies', {
      name: `Stage3 Company ${suffix}-${index}`,
    });
    companyIds.push(c.company.id);
    await post(`/companies/${c.company.id}/phone-numbers`, {
      rawNumber: `050-8${String(phoneSeed).padStart(3, '0')}-${String(index + 100).padStart(4, '0')}`,
      type,
      isPrimary: true,
      isCallable: true,
    });
  }
  const blockedCompany = await post<{ company: { id: string } }>('/companies', {
    name: `Stage3 Blocked ${suffix}`,
  });
  companyIds.push(blockedCompany.company.id);
  await post(`/companies/${blockedCompany.company.id}/phone-numbers`, {
    rawNumber: `050-7${String(phoneSeed).padStart(3, '0')}-9999`,
    type: 'representative',
    isPrimary: true,
    isCallable: true,
  });
  await post('/opt-outs', {
    companyId: blockedCompany.company.id,
    scope: 'company',
    channel: 'all',
    reasonCode: 'customer_request',
  });
  await post(`/sales-lists/${list.salesList.id}/companies`, { companyIds });
  const campaign = await post<{ campaign: { id: string } }>('/campaigns', {
    name: `Mock Campaign ${suffix}`,
    productVersionId: pv.productVersion.id,
    aiAgentVersionId: av.aiAgentVersion.id,
    scenarioVersionId: sv.scenarioVersion.id,
    knowledgeBaseId: kb.knowledgeBase.id,
    salesListId: list.salesList.id,
    callableWeekdays: [0, 1, 2, 3, 4, 5, 6],
    callableStartTime: '00:00',
    callableEndTime: '23:59',
  });
  const preview = await post<{
    summary: { eligible: number; excluded: number };
    targets: Array<{ exclusionReason: string | null }>;
  }>(`/campaigns/${campaign.campaign.id}/targets/preview`);
  expect(preview.summary).toEqual({ total: 4, eligible: 2, excluded: 2 });
  expect(preview.targets.map((t) => t.exclusionReason)).toEqual(
    expect.arrayContaining(['fax', 'opt_out:company']),
  );
  await post(`/campaigns/${campaign.campaign.id}/targets/materialize`);
  await post(`/campaigns/${campaign.campaign.id}/validate`);
  const premature = await page.request.post(`/backend/campaigns/${campaign.campaign.id}/start`, {
    headers,
    data: {},
  });
  expect(premature.status()).toBe(409);
  await post(`/campaigns/${campaign.campaign.id}/approve`);
  await post(`/campaigns/${campaign.campaign.id}/start`);
  await post(`/campaigns/${campaign.campaign.id}/mock-calls/run-next`, { fixture: 'qualified' });
  await expect
    .poll(async () => {
      const r = await page.request.get(`/backend/campaigns/${campaign.campaign.id}`);
      const b = (await r.json()) as { campaign: { jobs: Array<{ status: string }> } };
      return b.campaign.jobs[0]?.status;
    })
    .toBe('completed');
  await post(`/campaigns/${campaign.campaign.id}/mock-calls/run-next`, { fixture: 'opt_out' });
  await expect
    .poll(async () => {
      const r = await page.request.get('/backend/opt-outs');
      const b = (await r.json()) as { optOuts: Array<{ reasonText: string | null }> };
      return b.optOuts.some((o) => o.reasonText === 'Mock opt-out request');
    })
    .toBe(true);
  await post(`/campaigns/${campaign.campaign.id}/pause`);
  const paused = await page.request.post(
    `/backend/campaigns/${campaign.campaign.id}/mock-calls/run-next`,
    { headers, data: { fixture: 'qualified' } },
  );
  expect(paused.status()).toBe(409);
  await page.goto('/call-jobs');
  await expect(page.getByText('模擬通話・外部発信なし')).toBeVisible();
  await expect(page.getByText('qualified').first()).toBeVisible();
  await page.goto('/audit-logs');
  await expect(page.getByText('mock_call.outcome_applied').first()).toBeVisible();
  await expect(page.getByText('campaign.start').first()).toBeVisible();

  const gateCompany = await post<{ company: { id: string } }>('/companies', {
    name: `Stage4A Gate Company ${suffix}`,
  });
  const gateRawPhone = `050-6${String(phoneSeed).padStart(3, '0')}-8888`;
  const gatePhone = await post<{ phoneNumber: { id: string } }>(
    `/companies/${gateCompany.company.id}/phone-numbers`,
    { rawNumber: gateRawPhone, type: 'representative', isPrimary: true, isCallable: true },
  );
  const incomplete = await page.request.post('/backend/production-approvals', {
    headers,
    data: { purpose: '不足' },
  });
  expect(incomplete.status()).toBe(400);
  const approval = await post<{ approval: { id: string } }>('/production-approvals', {
    targetRegions: ['JP'],
    productIds: [product.product.id],
    purpose: '同意済み限定Mockテスト',
    aiDisclosure: 'AIによる電話であることを冒頭で開示します',
    recordingEnabled: false,
    recordingConsentMethod: '録音しない',
    transcriptionEnabled: false,
    personalDataRetentionDays: 30,
    callableWeekdays: [0, 1, 2, 3, 4, 5, 6],
    callableStartTime: '00:00',
    callableEndTime: '23:59',
    dailyCallLimit: 100,
    hourlyCallLimit: 100,
    concurrentCallLimit: 2,
    maxAttemptsPerCompany: 3,
    minRetryIntervalMinutes: 1,
    optOutOwner: '営業禁止責任者',
    emergencyStopOwner: '緊急停止責任者',
    privacyOwner: '個人情報管理責任者',
    plannedProvider: 'mock',
    dataResidency: 'Japan',
    crossBorderConfirmed: true,
    humanTransferMethod: 'Stage 4Aでは転送しない',
    limitedTestCallLimit: 10,
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    approvalBasis: 'Stage 4A Mock E2E technical approval only',
    notes: 'No real call',
  });
  await post(`/production-approvals/${approval.approval.id}/submit`);
  await put('/production-policy', {
    timezone: 'Asia/Tokyo',
    dailyCallLimit: 100,
    hourlyCallLimit: 100,
    concurrentCallLimit: 2,
    maxCallDurationSeconds: 600,
    dailyDurationLimitSeconds: 3600,
    monthlyBudgetMinor: 100000,
    dailyBudgetMinor: 10000,
    currency: 'JPY',
    limitedTestCallLimit: 10,
    mockCostPerCallMinor: 10,
  });
  await post('/test-call-allowlist', {
    phoneNumber: gateRawPhone,
    region: 'JP',
    ownerName: '同意済みテスト企業',
    purpose: 'Production Gate E2E',
    consentConfirmed: true,
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    notes: 'Mock only',
  });
  const systemLogin = await page.request.post('/backend/auth/login', {
    data: { email: 'system-admin@example.local', password: 'Stage4A-E2E-System!' },
  });
  expect(systemLogin.ok()).toBeTruthy();
  const systemCookies = [
    ...(systemLogin.headers()['set-cookie'] ?? '').matchAll(
      /(sales_ai_(?:session|csrf))=([^;,]+)/g,
    ),
  ].map(([, name, value]) => ({ name, value, url: 'http://127.0.0.1:3000' }));
  await page.context().addCookies(systemCookies);
  const systemHeaders = {
    'x-csrf-token': decodeURIComponent(
      systemCookies.find((c) => c.name === 'sales_ai_csrf')?.value ?? '',
    ),
  };
  const systemPost = async <T>(path: string, data: unknown = {}) => {
    const r = await page.request.post(`/backend${path}`, { headers: systemHeaders, data });
    expect(r.ok(), `${path}: ${await r.text()}`).toBeTruthy();
    return r.json() as Promise<T>;
  };
  await systemPost(`/production-approvals/${approval.approval.id}/approve`, {
    reason: 'Mock-only technical E2E approval',
  });
  const providerResponse = await page.request.put('/backend/provider-configurations', {
    headers: systemHeaders,
    data: { provider: 'mock', allowed: true, secretReferenceKey: null },
  });
  expect(providerResponse.ok(), await providerResponse.text()).toBeTruthy();
  const gate = await systemPost<{ decision: { allowed: boolean; reasonCodes: string[] } }>(
    '/production-gate/evaluate',
    {
      campaignId: campaign.campaign.id,
      companyId: gateCompany.company.id,
      phoneNumberId: gatePhone.phoneNumber.id,
      provider: 'mock',
      region: 'JP',
    },
  );
  expect(gate.decision).toMatchObject({ allowed: true, reasonCodes: [] });
  await page.goto('/production-readiness');
  await expect(page.getByText('REAL CALLS DISABLED')).toBeVisible();
});
