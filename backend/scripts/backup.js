#!/usr/bin/env node
// Writes a date/time-stamped backup ZIP (database.sql + img/) to ./backups (or --out <dir>).
// Use this for big databases: the in-app download is limited by the host (e.g. Netlify's 10 s / 6 MB).
import fs from 'node:fs';
import path from 'node:path';
import { config, assertConfig } from '../src/config.js';
import { closePool } from '../src/db/pool.js';
import { writeBackup, backupFileName } from '../src/services/backupService.js';

import readline from 'node:readline';
const askHidden = (q) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (t) => { if (t.includes(q)) rl.output.write(t); else if (t.includes('\n')) rl.output.write('\n'); }; // do not echo the password
  rl.question(q, (a) => { rl.close(); resolve(a); });
});
const i = process.argv.indexOf('--out');
const dir = path.resolve(i > -1 ? process.argv[i + 1] : 'backups');
try {
  assertConfig();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, backupFileName());
  const password = process.env.BACKUP_PASSWORD || (await askHidden('Backup password (the administrator password): '));
  if (!password) throw new Error('A password is required');
  const manifest = await writeBackup(fs.createWriteStream(file, { mode: 0o600 }), { password });
  console.log(`Backup written: ${file}\n`, manifest.rows, `\nphotos: ${manifest.photosFromDatabase}, image files from disk: ${manifest.imageFilesFromDisk}`);
} catch (e) { console.error('Backup failed:', e.message); process.exitCode = 1; } finally { await closePool(); }
void config;
