import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

describe('DIR-004: Multi-Tenant AI Governance Header Resolution & Self-Healing Flow', () => {
    it('resolveActiveTenantId extracts tenant from URL, memory, and browser storage', async () => {
        const { resolveActiveTenantId, setActiveTenantId } = await import('../src/services/aiService.js');
        
        // Mock global storage for node test environment
        const mockStorage = new Map();
        globalThis.sessionStorage = {
            getItem: (k) => mockStorage.get(k) || null,
            setItem: (k, v) => mockStorage.set(k, String(v)),
            removeItem: (k) => mockStorage.delete(k),
            key: (i) => Array.from(mockStorage.keys())[i],
            get length() { return mockStorage.size; }
        };
        globalThis.localStorage = {
            getItem: (k) => mockStorage.get(k) || null,
            setItem: (k, v) => mockStorage.set(k, String(v)),
            removeItem: (k) => mockStorage.delete(k),
            key: (i) => Array.from(mockStorage.keys())[i],
            get length() { return mockStorage.size; }
        };

        // 1. Explicit setActiveTenantId
        setActiveTenantId('test-tenant-123');
        assert.equal(resolveActiveTenantId(), 'test-tenant-123');
        assert.equal(sessionStorage.getItem('activeTenantId'), 'test-tenant-123');
        assert.equal(localStorage.getItem('activeTenantId'), 'test-tenant-123');

        // 2. Clear and check enterprise_context_request prefix
        setActiveTenantId(null);
        mockStorage.clear();
        sessionStorage.setItem('enterprise_context_request:user456', 'org-tenant-999');
        assert.equal(resolveActiveTenantId(), 'org-tenant-999');

        // Clean up
        mockStorage.clear();
        setActiveTenantId(null);
    });

    it('backend resolveAiGovernance returns deterministic primaryTenantId and availableTenants on ambiguity', async () => {
        const { resolveAiGovernance, QUOTA_SOURCE } = await import('../backend/security/aiGovernance.js');
        
        // Real user OhZdiSIFL7ePA1TMkfu9bnR935D3 who belongs to both Acme Corporation and Global Tech Industries
        const ambiguousReq = {
            user: { uid: 'OhZdiSIFL7ePA1TMkfu9bnR935D3' },
            get: () => undefined,
            body: {},
            query: {}
        };

        const result = await resolveAiGovernance(ambiguousReq);
        assert.equal(result.source, QUOTA_SOURCE.NONE);
        assert.equal(result.reason, 'AMBIGUOUS_ACTIVE_TENANT');
        assert.equal(result.error?.status, 400);
        assert.equal(result.error?.code, 'TENANT_CONTEXT_REQUIRED');
        assert.ok(result.error?.message.includes('Multiple active tenant memberships found'));
        assert.ok(result.error?.primaryTenantId, 'primaryTenantId must be provided in error');
        assert.ok(Array.isArray(result.error?.availableTenants), 'availableTenants must be an array');
        assert.ok(result.error.availableTenants.length >= 2, 'user belongs to at least 2 active org tenants');

        // Verify deterministic selection matches one of the active memberships
        const primaryId = result.error.primaryTenantId;
        assert.ok(result.error.availableTenants.some(t => t.tenantId === primaryId));

        // When the primary tenant is passed in X-Tenant-Id, request succeeds with zero error
        const resolvedReq = {
            user: { uid: 'OhZdiSIFL7ePA1TMkfu9bnR935D3' },
            get: (h) => (h.toLowerCase() === 'x-tenant-id' ? primaryId : undefined),
            body: {},
            query: {}
        };

        const resolvedResult = await resolveAiGovernance(resolvedReq);
        assert.equal(resolvedResult.source, QUOTA_SOURCE.ORGANIZATION);
        assert.equal(resolvedResult.tenant.tenantId, primaryId);
        assert.equal(resolvedResult.error, undefined);
        assert.ok(resolvedResult.quota.sharedLimit > 0);
    });

    it('EnterpriseContext.jsx and useAiTokenUsage.js synchronize activeTenantId to browser storage', () => {
        const enterpriseContextContent = fs.readFileSync(path.join(root, 'src/enterprise/EnterpriseContext.jsx'), 'utf8');
        const tokenUsageContent = fs.readFileSync(path.join(root, 'src/hooks/useAiTokenUsage.js'), 'utf8');
        const aiServiceContent = fs.readFileSync(path.join(root, 'src/services/aiService.js'), 'utf8');

        // EnterpriseContext syncs activeTenantId in load() and selectTenant()
        assert.ok(enterpriseContextContent.includes("sessionStorage.setItem('activeTenantId', activeTenantId)"));
        assert.ok(enterpriseContextContent.includes("sessionStorage.setItem('activeTenantId', tenantId)"));

        // useAiTokenUsage syncs raw.tenantId from telemetry read
        assert.ok(tokenUsageContent.includes("sessionStorage.setItem('activeTenantId', raw.tenantId)"));

        // aiService implements self-healing retry on TENANT_CONTEXT_REQUIRED
        assert.ok(aiServiceContent.includes('TENANT_CONTEXT_REQUIRED'));
        assert.ok(aiServiceContent.includes('autoResolveTenantFromFailure'));
    });

    after(() => {
        setTimeout(() => process.exit(0), 100);
    });
});
