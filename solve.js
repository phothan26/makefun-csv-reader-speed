// A fast drop-in for csv-reader 1.0.0: run(input) returns exactly csv-reader's
// {columns, rows, errors} for {text, header}, but reads the text with indexOf
// jumps and slice/split instead of one character at a time.
//
// The reading policy is csv-reader's own, followed exactly:
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote and each CRLF or lone CR inside it read as LF; what
//     follows its closing quote, up to the next comma or line break, is appended
//     as it stands (quote_junk, when the field ends); a quote that never closes
//     is a literal character, and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded with "" (short_row) or cut (long_row) to the
//     first record's width; each error is {code, line, row}, in the order met.
//
// Speed comes from two fast paths: a record with no quote in it is cut out with
// one indexOf and split on commas, and an unquoted field jumps straight to its
// next delimiter with indexOf instead of reading a character at a time. Only a
// record that holds a quote takes the careful path, and even there a quoted
// field is sliced whole when it holds no line break.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Returns the field and how it ended; `added` counts the characters kept by this call.
  // One regex search finds the next delimiter, instead of three indexOf scans (the CR scan would run far ahead
  // on files whose line breaks are LF).
  const DELIM = /[,\r\n]/g;
  const QUOTE_OR_CR = /["\r]/g;
  function readUnquoted(value) {
    let added = 0;
    while (true) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        added += len - pos;
        value += text.slice(pos);
        pos = len;
        return { value, ended: END, added };
      }
      const i = m.index;
      const ch = m[0];
      if (ch === ',') {
        added += i - pos;
        value += text.slice(pos, i);
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (ch === '\n') {
        added += i - pos;
        value += text.slice(pos, i);
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      if (text.charCodeAt(i + 1) === 10) {
        added += i - pos;
        value += text.slice(pos, i);
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      added += i - pos;
      value += text.slice(pos, i);
      pos = i + 1;
      error('stray_cr');
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    // The closing quote: the next quote that is not doubled.
    let q = text.indexOf('"', pos);
    let close = -1;
    while (q !== -1) {
      if (text.charCodeAt(q + 1) === 34) {
        q = text.indexOf('"', q + 2);
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    let value;
    const rIn = text.indexOf('\r', open + 1);
    const nIn = text.indexOf('\n', open + 1);
    if ((rIn === -1 || rIn >= close) && (nIn === -1 || nIn >= close)) {
      // No line break inside: the field is one slice, doubled quotes resolved.
      value = text.slice(open + 1, close);
      if (value.indexOf('""') !== -1) value = value.replaceAll('""', '"');
      pos = close + 1;
    } else {
      // Line breaks inside: build it segment by segment, each CRLF or lone CR one LF.
      value = '';
      let seg = open + 1;
      let p = open + 1;
      for (;;) {
        const qi = text.indexOf('"', p);
        const ri = text.indexOf('\r', p);
        const ni = text.indexOf('\n', p);
        let m = -1;
        let kind = -1;
        if (qi !== -1) {
          m = qi;
          kind = 0;
        }
        if (ri !== -1 && (m === -1 || ri < m)) {
          m = ri;
          kind = 1;
        }
        if (ni !== -1 && (m === -1 || ni < m)) {
          m = ni;
          kind = 2;
        }
        if (kind === 0) {
          if (text.charCodeAt(m + 1) === 34) {
            value += text.slice(seg, m);
            value += '"';
            p = m + 2;
            seg = p;
            continue;
          }
          value += text.slice(seg, m);
          pos = m + 1;
          break;
        }
        if (kind === 1) {
          value += text.slice(seg, m);
          value += '\n';
          line += 1;
          p = m + (text.charCodeAt(m + 1) === 10 ? 2 : 1);
          seg = p;
          continue;
        }
        value += text.slice(seg, m);
        value += '\n';
        line += 1;
        p = m + 1;
        seg = p;
      }
    }
    if (pos >= len) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  // Takes a record's fields in: the header, a row padded or cut to the first record's width, or nothing when the
  // line held no characters. Returns false when it took nothing.
  function takeRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return false;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return true;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
    return true;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const idx = text.indexOf('\n', pos);
    const segEnd = idx === -1 ? len : idx;
    // The first quote or CR in this record's span decides the path: one search
    // finds either, so a record with neither costs a single short scan.
    QUOTE_OR_CR.lastIndex = pos;
    const qr = QUOTE_OR_CR.exec(text);
    if (qr === null || qr.index >= segEnd) {
      // No quote, no CR: cut the record out whole and split on commas.
      const fields = text.slice(pos, segEnd).split(',');
      pos = idx === -1 ? len : idx + 1;
      if (idx !== -1) line += 1;
      takeRecord(fields, false);
      continue;
    }
    if (qr[0] === '"') {
      // A quote in this record: fall through to the careful path below.
    } else if (qr.index === segEnd - 1 && idx !== -1) {
      // The only CR is the CRLF ending.
      const fields = text.slice(pos, segEnd - 1).split(',');
      pos = idx + 1;
      line += 1;
      takeRecord(fields, false);
      continue;
    } else {
      // Stray CRs — but a quote later in this record still needs the careful path.
      const q2 = text.indexOf('"', qr.index + 1);
      if (q2 !== -1 && q2 < segEnd) {
        // Fall through to the careful path below.
      } else {
        // Drop the stray CRs, one stray_cr error each, the CRLF ending not counted.
        let n = 0;
        let p = qr.index;
        while (p !== -1 && p < segEnd) {
          n += 1;
          p = text.indexOf('\r', p + 1);
        }
        if (idx !== -1 && text.charCodeAt(segEnd - 1) === 13) n -= 1;
        for (let i = 0; i < n; i += 1) error('stray_cr');
        const fields = text.slice(pos, segEnd).replaceAll('\r', '').split(',');
        pos = idx === -1 ? len : idx + 1;
        if (idx !== -1) line += 1;
        takeRecord(fields, false);
        continue;
      }
    }
    // A quote in this record: read it field by field, the careful way.
    const fields = [];
    let quoted = false;
    let ended;
    do {
      quoted = text.charCodeAt(pos) === 34;
      const field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
      ended = field.ended;
    } while (ended === COMMA);
    takeRecord(fields, quoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
