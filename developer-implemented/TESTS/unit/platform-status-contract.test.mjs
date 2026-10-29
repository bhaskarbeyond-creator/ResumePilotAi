import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlatformCredentialStatus } from '../../../frontend/src/lib/platform-status-contract.ts';
test('validates credential status without implying provider health', () => {
 assert.deepEqual(parsePlatformCredentialStatus({success:true,hasDedicatedBYOK:true,credentialCount:1,providers:['x']}),{hasDedicatedBYOK:true,credentialCount:1,providers:['x']});
 for (const v of [null,{success:false},{success:true,hasDedicatedBYOK:false,credentialCount:1,providers:['x']},{success:true,hasDedicatedBYOK:false,credentialCount:0,providers:['x']}]) assert.throws(() => parsePlatformCredentialStatus(v));
});
