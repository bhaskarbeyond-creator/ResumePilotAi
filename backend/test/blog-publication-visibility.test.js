'use strict';
process.env.NODE_ENV = 'test';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const repositories = require('../repositories');
const original = repositories.getRepository;
const posts = [{id:'draft',slug:'draft',title:'Secret Draft',category:'Private',published:false}, {id:'public',slug:'public',title:'Published',category:'Public',published:true}];
repositories.getRepository = () => ({
  // Deliberately ignore the option: route must still protect against a bad double.
  async getBlogPosts() { return posts; },
  async getBlogPostBySlug(slug) { return posts.find(p => p.slug === slug); },
  async getBlogPostById(id) { return posts.find(p => p.id === id); },
});
const { blogDataRouter } = require('../routes/blogData');
repositories.getRepository = original;
const app = express();
app.use((req, _res, next) => { if (req.get('x-editor')) req.user = {uid:'editor',claims:{permissions:['blog.write']}}; else if (req.get('x-user')) req.user = {uid:'reader',claims:{role:'USER'}}; next(); });
app.use('/api/blog-data', blogDataRouter);

test('anonymous and ordinary users cannot discover draft rows or categories', async () => {
  const list = await request(app).get('/api/blog-data?publishedOnly=false');
  assert.equal(list.status,200); assert.deepEqual(list.body.posts.map(p => p.id),['public']);
  const ordinary = await request(app).get('/api/blog-data').set('x-user','1');
  assert.deepEqual(ordinary.body.posts.map(p => p.id),['public']);
  assert.equal((await request(app).get('/api/blog-data/draft').set('x-user','1')).status,404);
  const categories = await request(app).get('/api/blog-data/categories');
  assert.deepEqual(categories.body.categories.map(c => c.name),['Public']);
  for (const url of ['/api/blog-data/slug/draft','/api/blog-data/draft']) assert.equal((await request(app).get(url)).status,404);
  assert.equal((await request(app).get('/api/blog-data/slug/public')).status,200);
});
test('editor can read drafts, explicit published-only remains honored', async () => {
  const list = await request(app).get('/api/blog-data').set('x-editor','1'); assert.equal(list.body.posts.length,2);
  const publicOnly = await request(app).get('/api/blog-data?publishedOnly=true').set('x-editor','1'); assert.deepEqual(publicOnly.body.posts.map(p=>p.id),['public']);
  assert.equal((await request(app).get('/api/blog-data/draft').set('x-editor','1')).status,200);
});
