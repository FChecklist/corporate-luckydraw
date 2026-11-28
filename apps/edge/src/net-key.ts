// The "network" a visitor comes from, for the per-network allowances (wrong-ID guesses, new seats).
//   - An IPv4 address is used as it is.
//   - An IPv6 address is cut to its first 64 bits (the /64). One home or office line normally owns a whole /64
//     (about 1.8e19 addresses) and can change the last half at will, so counting the full text would give a script
//     a fresh allowance on every request (audit M1 of 9024db89).
// Pure text work, no network calls.

/** The 8 hextets of an IPv6 address, or null when the text is not one. Accepts "::" gaps, an IPv4 tail, brackets and a zone id. */
function hextets(raw: string): number[] | null {
  let s = raw.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const z = s.indexOf("%"); if (z >= 0) s = s.slice(0, z);
  if (!s.includes(":")) return null;
  const v4 = s.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) { const o = [v4[2]!, v4[3]!, v4[4]!, v4[5]!].map(Number); if (o.some((n) => n > 255)) return null; s = `${v4[1]}${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`; }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const part = (t: string) => (t === "" ? [] : t.split(":"));
  const head = part(halves[0]!), tail = halves.length === 2 ? part(halves[1]!) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + tail.length > 7) return null;
  const all = halves.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail] : head;
  const out = all.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  return out.length === 8 && out.every((n) => Number.isInteger(n)) ? out : null;
}

/** The text that is hashed for a per-network counter. IPv4 (and anything not recognised) comes back unchanged; IPv6 comes back as its /64. */
export function netGroup(ip: string | null | undefined): string {
  const raw = (ip ?? "").trim();
  if (!raw) return "local";
  const h = hextets(raw);
  if (!h) return raw;
  if (h.slice(0, 5).every((n) => n === 0) && h[5] === 0xffff) return `${h[6]! >> 8}.${h[6]! & 255}.${h[7]! >> 8}.${h[7]! & 255}`; // an IPv4 address written the IPv6 way is the same visitor as the plain IPv4 address
  return "v6/" + h.slice(0, 4).map((n) => n.toString(16)).join(":");
}
