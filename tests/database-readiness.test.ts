import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { DatabaseReadiness } from '../src/server/database-readiness.js';
import { AppError } from '../src/server/errors.js';

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
function fixture(reply?: (url: URL) => Response | undefined, cacheMs?: number) {
  const calls: { url: URL; method: string }[] = [];
  const client = createClient('https://database.example.test', 'test-only-key', {
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method || 'GET';
      calls.push({ url, method });
      const result = reply?.(url);
      if (result) return result;
      if (url.pathname.endsWith('/rpc/register_event')) {
        assert.equal(method, 'POST');
        const body = JSON.parse(String(init?.body));
        assert.match(body.event_id, /^eventz-readiness-[0-9a-f-]{36}$/);
        assert.equal(body.attendee_id, 'eventz-readiness');
        return response({ code: 'P0001', message: 'Registration is closed.' }, 400);
      }
      assert.equal(method, 'GET');
      assert.equal(url.searchParams.get('limit'), '0');
      return response([]);
    } },
  });
  return { readiness: new DatabaseReadiness(client, cacheMs), calls };
}

test('readiness checks all tables and the registration guard without retrieving records; concurrent probes share a cache', async () => {
  const { readiness, calls } = fixture();
  await Promise.all([readiness.check(), readiness.check(), readiness.check()]);
  await readiness.check();
  assert.equal(calls.length, 8);
  assert.deepEqual(calls.filter(call => call.method === 'GET').map(call => call.url.pathname.split('/').pop()).sort(),
    ['users','events','participants','scanLogs','emailLogs','passHistory','passSecurityAlerts'].sort());
  assert.match(calls.find(call => call.url.pathname.endsWith('/events'))!.url.searchParams.get('select')!, /logoPath/);
});

test('readiness detects missing event columns before checking registration, then recovers after repair', async () => {
  let repaired = false;
  const { readiness, calls } = fixture(url => !repaired && url.pathname.endsWith('/events')
    ? response({ code: '42703', message: 'Private provider diagnostic' }, 400) : undefined, 0);
  await assert.rejects(readiness.check(), error => error instanceof AppError
    && error.code === 'DATABASE_SCHEMA_OUTDATED' && !error.message.includes('Private provider'));
  assert.equal(calls.length, 7);
  repaired = true;
  await readiness.check();
  assert.equal(calls.length, 15);
});

test('readiness detects missing registration RPC and invalid database access', async () => {
  for (const [path, providerCode, appCode] of [
    ['/rpc/register_event','PGRST202','DATABASE_SCHEMA_OUTDATED'],
    ['/users','42501','DATABASE_ACCESS_DENIED'],
  ]) {
    const { readiness, calls } = fixture(url => url.pathname.endsWith(path)
      ? response({ code: providerCode, message: 'Provider diagnostic' }, 400) : undefined);
    await assert.rejects(readiness.check(), error => error instanceof AppError && error.code === appCode);
    const count = calls.length;
    await assert.rejects(readiness.check());
    assert.equal(calls.length, count, 'Failed probes must also be cached');
  }
});
