// Frame lists of the dragongame pack (one BMP per token; a leading FANCY means `name N` pairs).
// Pure: no file access, so the build and the browser (pixel/) share it.

/** Plain lists: 6 sim ticks (60 Hz) per frame. FANCY durations are in 30 Hz ticks, so they are doubled. */
export const DEFAULT_TICKS = 6;
export const FANCY_TICK_SCALE = 2;

/**
 * Parse a sequence .txt. Tokens are whitespace separated (CRLF, blank lines, trailing spaces and a
 * missing final newline all vanish). A leading FANCY token means `name N` pairs.
 * Returns [{ file, ticks }] with file relative to the .txt.
 */
export function parseSequence(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const fancy = tokens[0] === 'FANCY';
  if (fancy) tokens.shift();
  const out = [];
  if (fancy) {
    if (tokens.length % 2 !== 0) throw new Error('FANCY sequence has an odd number of tokens');
    for (let i = 0; i < tokens.length; i += 2) {
      const n = Number(tokens[i + 1]);
      if (!Number.isInteger(n) || n < 1) throw new Error(`FANCY duration "${tokens[i + 1]}" for ${tokens[i]} is not a positive integer`);
      out.push({ file: tokens[i], ticks: n * FANCY_TICK_SCALE });
    }
  } else {
    for (const file of tokens) out.push({ file, ticks: DEFAULT_TICKS });
  }
  return out;
}
