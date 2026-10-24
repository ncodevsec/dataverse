import { withTransaction } from '../db/pool.js';
import { badRequest } from '../utils/httpError.js';
import { bulkImportEnvelope, importPersonSchema } from '../utils/schemas.js';
import { createPeopleTx } from './peopleService.js';

const PERSON_FIELDS = ['nickname', 'gender', 'dob', 'phone', 'email', 'website', 'occupation', 'religion', 'politicalView', 'district', 'about', 'tags'];
class Rollback extends Error {}

/** Validates the whole file first; returns the rows or throws a 422 listing every problem. */
export function validateImport(body) {
  const env = bulkImportEnvelope.safeParse(body);
  if (!env.success) throw badRequest(env.error.issues[0].message, { file: env.error.issues.map((i) => `${i.path.join('.') || 'file'}: ${i.message}`).slice(0, 5).join('; ') });
  const rows = []; const errors = [];
  env.data.peoples.forEach((item, index) => {
    const r = importPersonSchema.safeParse({ ...(env.data.defaults || {}), ...item });
    if (r.success) rows.push(r.data);
    else errors.push({ index: index + 1, name: typeof item?.name === 'string' ? item.name : null, problems: r.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`) });
  });
  if (errors.length) { const e = badRequest(`${errors.length} row(s) have problems. Nothing was imported.`, { rows: errors.slice(0, 50) }); e.status = 422; throw e; }
  return rows;
}

/**
 * Creates (or re-uses, matched by phone number) every person and connects them to the organization with their role.
 * All-or-nothing; with dryRun the transaction is rolled back so the numbers are exact but nothing is saved.
 */
export async function importPeoples(organizationId, rows, viewer, { dryRun = false } = {}) {
  const summary = { created: 0, linkedExisting: 0, alreadyMember: 0, results: [] };
  try {
    await withTransaction(async (client) => {
      for (const [i, row] of rows.entries()) {
        const { role, relation, startedOn, endedOn, note, ...fields } = row;
        const digits = (fields.phone || '').replace(/\D/g, '');
        let peopleId = null;
        if (digits.length >= 10) {
          const found = await client.query('SELECT id FROM peoples WHERE length(phone_digits) >= 10 AND right(phone_digits, 10) = right($1, 10) LIMIT 2', [digits]);
          if (found.rows.length === 1) peopleId = found.rows[0].id;
        }
        let action;
        if (peopleId == null) {
          const data = { name: fields.name };
          for (const k of PERSON_FIELDS) if (fields[k] !== undefined && fields[k] !== null) data[k] = fields[k];
          peopleId = await createPeopleTx(client, data, viewer); summary.created++; action = 'created';
        } else { summary.linkedExisting++; action = 'linked existing'; }
        const ins = await client.query(
          `INSERT INTO memberships (people_id, organization_id, relation, role, started_on, ended_on, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (people_id, organization_id, relation) DO NOTHING RETURNING id`,
          [peopleId, organizationId, relation || 'MEMBER', role ?? null, startedOn ?? null, endedOn ?? null, note ?? null, viewer.id]);
        if (!ins.rows.length) { summary.alreadyMember++; action = 'already a member'; }
        if (summary.results.length < 100) summary.results.push({ row: i + 1, name: fields.name, peopleId, action });
      }
      if (dryRun) throw new Rollback();
    });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
  return { dryRun, total: rows.length, ...summary };
}
