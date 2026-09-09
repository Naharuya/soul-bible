import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemberStore } from '../src/member_store.js';

test('native SQLite persists members and rejects duplicate phone after reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'soul-member-test-'));
  const filename = join(directory, 'fixture.sqlite');
  let store;
  try {
    store = createMemberStore({ filename });
    const fixture = { name: '테스트회원', phone: '01012345678', churchName: '테스트교회', loginProvider: 'phone' };
    const member = store.create(fixture);
    assert.equal(member.phone, fixture.phone);
    store.close();
    store = undefined;
    store = createMemberStore({ filename });
    const overview = store.getAdminOverview();
    assert.equal(overview.total, 1);
    assert.equal(overview.recent[0].phone, '010****5678');
    assert.equal(overview.recent[0].churchName, '비공개');
    assert.throws(() => store.create(fixture), { code: 'PHONE_EXISTS' });
  } finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
