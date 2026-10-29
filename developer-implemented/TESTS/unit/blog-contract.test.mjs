import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicBlogPosts } from '../../../frontend/src/pages/blog/blog-contract.ts';
test('only documented published rows are rendered and sparse fields are safe', () => {
 const rows = parsePublicBlogPosts({success:true,posts:[{id:'a',title:'Article',published:true}]});
 assert.equal(rows[0].excerpt,''); assert.equal(rows[0].publishedAt,null); assert.equal(rows[0].readTime,null);
 for (const bad of [null, {success:true,posts:[{id:'a',title:'Draft',published:false}]}, {success:false,posts:[]}, {success:true,posts:[{}]}]) assert.throws(() => parsePublicBlogPosts(bad));
});
