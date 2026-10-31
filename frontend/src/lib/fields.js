import { age, fmtDate, GENDER, MARITAL } from './format.js';
import { orgTypeLabel } from './options.js';

const short = (u) => (u ? u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : null);
const tags = (t) => (t?.length ? t.map((x) => `#${x}`).join(' ') : null);

/** Everything a card or a table column can show. NID and political view are deliberately not available here. */
export const PEOPLE_FIELDS = [
  { key: 'nickname', label: 'Nickname', get: (p) => p.nickname },
  { key: 'occupation', label: 'Occupation', get: (p) => p.occupation },
  { key: 'district', label: 'District', get: (p) => p.district },
  { key: 'presentCity', label: 'City', get: (p) => p.presentCity },
  { key: 'phone', label: 'Phone', get: (p) => p.phone },
  { key: 'email', label: 'Email', get: (p) => p.email },
  { key: 'website', label: 'Website', get: (p) => short(p.website) },
  { key: 'gender', label: 'Gender', get: (p) => GENDER[p.gender] },
  { key: 'maritalStatus', label: 'Marital status', get: (p) => MARITAL[p.maritalStatus] },
  { key: 'bloodGroup', label: 'Blood group', get: (p) => p.bloodGroup },
  { key: 'age', label: 'Age', get: (p) => { const a = age(p.dob, p.dateOfDeath); return a === null ? null : `${a}${p.dateOfDeath ? ' (deceased)' : ''}`; } },
  { key: 'religion', label: 'Religion', get: (p) => p.religion },
  { key: 'lineage', label: 'Lineage', get: (p) => p.lineage },
  { key: 'tags', label: 'Tags', get: (p) => tags(p.tags) },
  { key: 'createdAt', label: 'Added', get: (p) => fmtDate(p.createdAt, 'dmy') },
];
export const ORG_FIELDS = [
  { key: 'shortName', label: 'Short name', get: (o) => o.shortName },
  { key: 'orgType', label: 'Type', get: (o) => orgTypeLabel(o.orgType) },
  { key: 'district', label: 'District', get: (o) => o.district },
  { key: 'phone', label: 'Phone', get: (o) => o.phone },
  { key: 'email', label: 'Email', get: (o) => o.email },
  { key: 'website', label: 'Website', get: (o) => short(o.website) },
  { key: 'foundedOn', label: 'Founded', get: (o) => (o.foundedOn ? String(o.foundedOn).slice(0, 4) : null) },
  { key: 'tags', label: 'Tags', get: (o) => tags(o.tags) },
  { key: 'createdAt', label: 'Added', get: (o) => fmtDate(o.createdAt, 'dmy') },
];
export const FIELD_SETS = { people: PEOPLE_FIELDS, organization: ORG_FIELDS };
export const DEFAULT_COLUMNS = { people: ['occupation', 'district', 'phone'], organization: ['orgType', 'district', 'phone'] };
export const DEFAULT_CARD_FIELDS = { people: ['nickname', 'occupation', 'district'], organization: ['district', 'foundedOn'] };

/** [{ key, label, text }] for the given keys, skipping empty values. */
export const fieldValues = (kind, item, keys) => keys.map((k) => FIELD_SETS[kind].find((f) => f.key === k)).filter(Boolean)
  .map((f) => ({ key: f.key, label: f.label, text: f.get(item) })).filter((v) => v.text);
