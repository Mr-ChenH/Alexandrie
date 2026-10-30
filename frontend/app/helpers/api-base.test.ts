import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveApiBase } from './api-base';

test('uses Docker service DNS for SSR without exposing it in client requests', () => {
  assert.equal(resolveApiBase('https://api.example.com', 'http://backend:8201', true), 'http://backend:8201/api');
  assert.equal(resolveApiBase('https://api.example.com', 'http://backend:8201', false), 'https://api.example.com/api');
});

test('supports direct local development, base paths, and same-origin APIs', () => {
  assert.equal(resolveApiBase('http://localhost:8201/', '', true), 'http://localhost:8201/api');
  assert.equal(resolveApiBase('https://notes.example.com/backend/', '', false), 'https://notes.example.com/backend/api');
  assert.equal(resolveApiBase('', '', false), '/api');
});
