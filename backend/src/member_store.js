import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function createMemberStore({ filename = path.resolve('data', 'members.sqlite') } = {}) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      church_name TEXT NOT NULL,
      login_provider TEXT NOT NULL DEFAULT 'phone',
      provider_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS members_provider_identity
      ON members(login_provider, provider_user_id)
      WHERE provider_user_id IS NOT NULL;
  `);
  const findByPhone = db.prepare('SELECT * FROM members WHERE phone = ?');
  const countMembers = db.prepare('SELECT COUNT(*) AS count FROM members');
  const recentMembers = db.prepare(`SELECT id, name, phone, church_name, login_provider, created_at
    FROM members ORDER BY id DESC LIMIT ?`);
  const insert = db.prepare(`INSERT INTO members (name, phone, church_name, login_provider, provider_user_id)
    VALUES (@name, @phone, @churchName, @loginProvider, @providerUserId)`);
  return {
    create(member) {
      if (findByPhone.get(member.phone)) {
        const error = new Error('이미 가입된 휴대폰 번호입니다.');
        error.code = 'PHONE_EXISTS';
        throw error;
      }
      const result = insert.run({ ...member, providerUserId: member.providerUserId ?? null });
      return db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
    },
    getAdminOverview({ limit = 8 } = {}) {
      return {
        total: countMembers.get().count,
        recent: recentMembers.all(limit).map((member) => ({
          id: member.id,
          name: member.name,
          phone: member.phone.length >= 7
            ? `${member.phone.slice(0, 3)}****${member.phone.slice(-4)}`
            : '****',
          churchName: member.church_name,
          provider: member.login_provider,
          createdAt: member.created_at,
        })),
      };
    },
    close() { db.close(); },
  };
}
