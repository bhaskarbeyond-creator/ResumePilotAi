import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('CertificationsStep Modern Card-Style UX Verification Suite', () => {
    const fileContent = fs.readFileSync('src/components/BuildResume/steps/CertificationsStep.jsx', 'utf8');

    // 1. Replaces legacy EntryList accordion with dedicated elevated cards
    assert.doesNotMatch(fileContent, /<EntryList/, 'Must replace legacy EntryList accordion with elevated card view');
    assert.match(fileContent, /CERT_TYPES\s*=\s*\[/, 'Must export CERT_TYPES with rich visual metadata');
    assert.match(fileContent, /rounded-2xl\s+space-y-4\s+hover:border-slate-300\s+shadow-2xs/, 'Must render elevated rounded-2xl cards');

    // 2. Card Header Controls (Reordering, Duplication, Deletion)
    assert.match(fileContent, /moveCertification\(certification\.id,\s*-1\)/, 'Card must support move up');
    assert.match(fileContent, /moveCertification\(certification\.id,\s*1\)/, 'Card must support move down');
    assert.match(fileContent, /duplicateCertification\(certification\.id\)/, 'Card must support 1-click duplication');
    assert.match(fileContent, /removeCertification\(certification\.id\)/, 'Card must support deletion');

    // 3. Interactive Classification Selector Pills
    assert.match(fileContent, /updateCertification\(certification\.id,\s*'certType',\s*type\.id\)/, 'Card must support 1-click type classification toggle');
    assert.match(fileContent, /updateCertification\(certification\.id,\s*'isLicense',\s*type\.id\s*===\s*'License'\)/, 'Must synchronize isLicense flag with License type');

    // 4. Input Fields Architecture
    assert.match(fileContent, /AutocompleteInputField/, 'Must provide AutocompleteInputField for credential name and issuer');
    assert.match(fileContent, /suggestionType="certification"/, 'Must provide certification suggestions');
    assert.match(fileContent, /suggestionType="issuer"/, 'Must provide issuer suggestions');
    assert.match(fileContent, /Date earned/, 'Must provide Date earned field');
    assert.match(fileContent, /Expiration \/ Renewal Date/, 'Must provide Expiration / Renewal Date field');
    assert.match(fileContent, /Credential ID \/ License #/, 'Must provide Credential ID field');
    assert.match(fileContent, /Verification URL/, 'Must provide Verification URL field');
    assert.match(fileContent, /Test live URL/, 'Must provide Test live URL verification anchor');

    // 5. Modern Command Toolbar & Real-Time Search / Type Filtering
    assert.match(fileContent, /Professional Credentials/, 'Must display Professional Credentials toolbar title');
    assert.match(fileContent, /Suggest Credentials \(AI\)/, 'Must provide 1-click AI recommendation trigger in toolbar');
    assert.match(fileContent, /searchQuery/, 'Must support live search query');
    assert.match(fileContent, /selectedTypeFilter/, 'Must support category filter pills');
    assert.match(fileContent, /filteredCertifications/, 'Must compute filteredCertifications via useMemo');

    // 6. Zero-Fabrication Invariants Preserved
    assert.match(fileContent, /date:\s*initialData\.date\s*\|\|\s*''/, 'Must never fabricate year in new certification objects');
    assert.match(fileContent, /AiPromptCard/, 'Must route suggestions through AiPromptCard');
});
