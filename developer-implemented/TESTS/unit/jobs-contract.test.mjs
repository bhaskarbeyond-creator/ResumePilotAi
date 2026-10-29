import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJobListings, filterJobListings } from '../../../frontend/src/pages/jobs/jobs-contract.ts';
test('maps public jobs-data rows and filters the actual result', () => {
 const jobs = parseJobListings({success:true,jobs:[{id:'job1',title:'Engineer',company_name:'Example',location:'Remote',job_type:'Full-time',workplace_type:'Remote',skills:['TS'],created_at:'2025-01-01',featured:1}]});
 assert.equal(jobs[0].company,'Example'); assert.equal(jobs[0].type,'full-time'); assert.equal(jobs[0].featured,true);
 assert.equal(filterJobListings(jobs,'TS','remote','Full-time').length,1);
 assert.equal(filterJobListings(jobs,'','','Remote').length,1);
 assert.equal(filterJobListings(jobs,'nurse','','All').length,0);
});
test('rejects failed or malformed responses instead of claiming an empty listing', () => {
 for (const value of [null, {}, {success:false,jobs:[]}, {success:true,jobs:[{}]}]) assert.throws(() => parseJobListings(value));
});
