import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

export const contentReportSchema = z.object({
  submissionId: z.string().regex(/^[a-f0-9]{32}$/),
  reason: z.enum(['unsafe', 'hate', 'sexual', 'incorrect_scripture', 'misleading', 'other']),
  includeResponse: z.boolean(),
  responseText: z.string().trim().min(1).max(3000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.includeResponse !== (value.responseText !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Response attachment requires explicit consent.' });
  }
});
export function createContentReports({ filename, retentionDays, now = () => Date.now() }) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw Error('Invalid report retention');
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('secure_delete = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS content_reports (
    id TEXT PRIMARY KEY, reason TEXT NOT NULL, response_text TEXT,
    created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
  )`);
  const purge = () => db.prepare('DELETE FROM content_reports WHERE created_at < ?').run(now() - retentionDays * 86400000);
  const insert = db.prepare('INSERT OR IGNORE INTO content_reports(id, reason, response_text, created_at) VALUES (?, ?, ?, ?)');
  return {
    add(value) {
      const report = contentReportSchema.parse(value);
      purge();
      const existing = db.prepare('SELECT reason, response_text FROM content_reports WHERE id = ?').get(report.submissionId);
      if (existing && (existing.reason !== report.reason || existing.response_text !== (report.responseText ?? null))) {
        const error = Error('REPORT_ID_REUSED'); error.code = 'REPORT_ID_REUSED'; throw error;
      }
      if (!existing && db.prepare('SELECT COUNT(*) AS n FROM content_reports').get().n >= 10000) {
        const error = Error('REPORT_CAPACITY'); error.code = 'REPORT_CAPACITY'; throw error;
      }
      insert.run(report.submissionId, report.reason, report.responseText ?? null, now());
    },
    list() { purge(); return db.prepare('SELECT id, reason, response_text AS responseText, created_at AS createdAt, status FROM content_reports ORDER BY created_at DESC, id LIMIT 100').all(); },
    review(id) { purge(); return db.prepare("UPDATE content_reports SET status = 'reviewed' WHERE id = ?").run(id).changes > 0; },
    purge,
    close() { db.close(); },
  };
}
