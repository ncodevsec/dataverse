// Tiny, dependency-free reader for `mysqldump` files: extracts column names from CREATE TABLE and the
// rows of every `INSERT INTO ... VALUES (...),(...);` statement. Handles quoted strings, backslash escapes,
// doubled quotes, NULL and numbers - everything mysqldump emits for this project.

const ESCAPES = { n: '\n', r: '\r', t: '\t', 0: '\0', b: '\b', Z: '\x1a' };

function readString(s, i) {
  // s[i] === "'" ; returns [value, nextIndex]
  let out = '';
  i++;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      const nx = s[i + 1];
      out += Object.hasOwn(ESCAPES, nx) ? ESCAPES[nx] : nx; // \' \" \\ and unknown escapes -> literal char
      i += 2;
    } else if (ch === "'") {
      if (s[i + 1] === "'") { out += "'"; i += 2; } else return [out, i + 1];
    } else { out += ch; i++; }
  }
  throw new Error('Unterminated string in SQL dump');
}

/** Parses the text after `VALUES` starting at index i until the closing ';'. Returns { rows, end }. */
function readTuples(s, i) {
  const rows = [];
  let row = null;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(') { row = []; i++; continue; }
    if (ch === ')') { rows.push(row); row = null; i++; continue; }
    if (ch === ';' && !row) return { rows, end: i + 1 };
    if (!row) { i++; continue; } // commas / whitespace between tuples
    if (ch === ',' || ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') { i++; continue; }
    if (ch === "'") { const [v, n] = readString(s, i); row.push(v); i = n; continue; }
    // bare token: number or NULL (or _binary 'x' which we do not expect)
    let j = i;
    while (j < s.length && ![',', ')'].includes(s[j])) j++;
    const tok = s.slice(i, j).trim();
    row.push(tok.toUpperCase() === 'NULL' ? null : tok);
    i = j;
  }
  return { rows, end: i };
}

export function parseDump(sql) {
  const tables = {};
  const create = /CREATE TABLE `(\w+)` \(([\s\S]*?)\)\s*ENGINE/g;
  for (let m; (m = create.exec(sql));) {
    const columns = [...m[2].matchAll(/^\s*`(\w+)`\s/gm)].map((c) => c[1]);
    tables[m[1]] = { columns, rows: [] };
  }
  const insert = /INSERT INTO `(\w+)`(?: \(([^)]*)\))? VALUES\s*/g;
  for (let m; (m = insert.exec(sql));) {
    const name = m[1];
    const { rows, end } = readTuples(sql, insert.lastIndex);
    insert.lastIndex = end;
    const t = (tables[name] ||= { columns: [], rows: [] });
    const cols = m[2] ? m[2].split(',').map((c) => c.trim().replace(/`/g, '')) : t.columns;
    for (const r of rows) t.rows.push(Object.fromEntries(cols.map((c, idx) => [c, r[idx] ?? null])));
  }
  return tables;
}
