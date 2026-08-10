import "server-only";
import { canonicalItemName } from "@/lib/analytics/clean-sales";

/**
 * "Is this product still on the menu?" — the matcher behind the auto-ignore rule.
 *
 * The POS exports kitchen spellings that drift from the menu entry in every way a
 * human typing at a till drifts, and each variant would otherwise read as a
 * delisted product and get hidden:
 *
 *   menu "Tuzlu Sirkeli Patates Kızartması"     POS "Tuzlu Sirkeli Patates"
 *   menu "Trüf Parmesanlı Patates Kızartması"   POS "Patates Kızartması Truf & Parmesanlı"
 *   menu "Cheddarlı Patates Kızartması"         POS "Patates Kızartması Cheddar Soslu"
 *   menu "Filtre Kahve"                         POS "Filtre Kahvesi"
 *   menu "Çay"                                  POS "Fincan Çay ."
 *   menu "Beyaz BBQ Sos"                        POS "Beyaz Bbq"
 *
 * So the comparison runs on a relaxed key — diacritics folded, punctuation and "&"
 * dropped, Turkish suffixes stemmed, noise words ("kızartması", "sos", "fincan")
 * removed, tokens sorted — and falls back to token containment and a one-typo
 * tolerance.
 *
 * The bias is deliberately toward MATCHING. A false match only means a delisted
 * item stays in the charts (visible, and tickable by hand); a false miss silently
 * hides a product the kitchen is still selling, which is the failure that actually
 * costs the owner something.
 *
 * Note the stemming is intentionally crude and can mangle a word — that's fine,
 * because BOTH sides go through the identical transform. Symmetry is what matters
 * here, not linguistic correctness.
 */

const FOLD: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u", é: "e",
};

/** Turkish letters → ASCII, so "Trüf" and "Truf" land on the same token. */
const fold = (s: string) => s.toLocaleLowerCase("tr").replace(/[çğıöşüâîûé]/g, (c) => FOLD[c] ?? c);

/**
 * Words that carry no product identity in this menu's POS exports. "Patates" is
 * NOT one of them — it's what separates plain fries from everything else.
 */
const NOISE = new Set([
  "kizartmasi",
  "kizartma",
  "sos",
  "soslu",
  "sosu",
  "fincan",
  "porsiyon",
  "adet",
  "bardak",
  "kupa",
  "tabak",
]);

/** Turkish suffixes, ASCII form (applied after folding). Longest first. */
const SUFFIXES = ["lari", "leri", "lar", "ler", "li", "lu", "si", "su"];

/** One pass of suffix stripping, never below a 3-char stem ("Su"/water survives). */
function stem(token: string): string {
  for (const suffix of SUFFIXES) {
    if (token.length - suffix.length >= 3 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

/** Identity-carrying tokens of a name: folded, de-punctuated, stemmed, de-noised. */
function tokensOf(name: string): Set<string> {
  const out = new Set<string>();
  for (const raw of fold(name).split(/[^a-z0-9]+/)) {
    if (!raw) continue;
    const t = stem(raw);
    if (t && !NOISE.has(t) && !NOISE.has(raw)) out.add(t);
  }
  return out;
}

/** Order-independent key, so "A & B Fries" and "Fries B A" collapse together. */
const looseKey = (tokens: Set<string>) => [...tokens].sort().join(" ");

/** True when one edit (insert/delete/replace) turns `a` into `b` — POS typos. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Minimum tokens two names must share before containment counts as a match. */
const MIN_SHARED_TOKENS = 2;
/** Below this length a one-edit difference is a different product, not a typo. */
const MIN_TYPO_LENGTH = 5;

/** A candidate menu name for an unrecognised POS line, with its match score. */
export type MenuSuggestion = { name: string; score: number };

export type MenuMatcher = {
  /** True when `name` still corresponds to something on the menu. */
  onMenu: (name: string) => boolean;
  /**
   * Best menu names for an unmatched POS line, strongest first. Powers the
   * import mapping step, where the owner needs a shortlist rather than a
   * yes/no verdict — `onMenu` already said no by the time this is called.
   */
  suggest: (name: string, limit?: number) => MenuSuggestion[];
  /** Stable digest of the menu snapshot, for cache keys. */
  digest: string;
  /** How many distinct menu names went in — 0 means "unknown", never "empty menu". */
  size: number;
};

/**
 * 0–1 similarity between two names, on the same relaxed key `onMenu` compares on.
 * Token overlap (Jaccard) carries most of the weight because POS lines drop and
 * reorder words freely; a character-level ratio breaks ties between names that
 * share no whole token but are clearly the same word misspelled.
 */
function similarity(a: Set<string>, aKey: string, b: Set<string>, bKey: string): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const union = a.size + b.size - shared;
  const jaccard = union > 0 ? shared / union : 0;

  // Cheap character-bigram overlap — enough to rank "Cripsy Burger" against
  // "Crispy Burger" above unrelated names, without a full edit-distance matrix.
  const grams = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const ga = grams(aKey);
  const gb = grams(bKey);
  let g = 0;
  for (const x of ga) if (gb.has(x)) g++;
  const gramScore = ga.size + gb.size > 0 ? (2 * g) / (ga.size + gb.size) : 0;

  return 0.7 * jaccard + 0.3 * gramScore;
}

/**
 * Build the matcher from every current menu name (items + add-on options, both
 * locales). Results are memoized per queried name: the fallback layers scan the
 * whole menu, and the same handful of item names get asked about repeatedly.
 */
export function buildMenuMatcher(menuNames: string[]): MenuMatcher {
  const exact = new Set<string>();
  const loose = new Set<string>();
  const tokenSets: Set<string>[] = [];
  // Parallel to `tokenSets`, carrying what `suggest` needs to rank and display.
  const entries: { display: string; tokens: Set<string>; key: string }[] = [];

  for (const name of menuNames) {
    if (!name?.trim()) continue;
    exact.add(canonicalItemName(name).toLocaleLowerCase("tr"));
    const tokens = tokensOf(name);
    if (tokens.size === 0) continue;
    const key = looseKey(tokens);
    if (loose.has(key)) continue;
    loose.add(key);
    tokenSets.push(tokens);
    entries.push({ display: canonicalItemName(name), tokens, key });
  }

  const looseKeys = [...loose];
  const memo = new Map<string, boolean>();

  const test = (name: string): boolean => {
    if (exact.has(canonicalItemName(name).toLocaleLowerCase("tr"))) return true;

    const tokens = tokensOf(name);
    if (tokens.size === 0) return false;

    const key = looseKey(tokens);
    if (loose.has(key)) return true;

    // Containment: "Apple & Cinnamon & Caramel Waffle" keeps the menu's
    // "Apple & Cinnamon Waffle", and "Cheddar Patates" keeps "Cheddarlı Patates
    // Kızartması" — but plain "Patates" (1 shared token) stays its own product.
    for (const menuTokens of tokenSets) {
      let shared = 0;
      for (const t of tokens) if (menuTokens.has(t)) shared++;
      if (shared >= MIN_SHARED_TOKENS && (shared === tokens.size || shared === menuTokens.size)) return true;
    }

    // Last resort: a single typo ("Churchil" vs "Churchill").
    if (key.length >= MIN_TYPO_LENGTH) {
      for (const menuKey of looseKeys) {
        if (menuKey.length >= MIN_TYPO_LENGTH && withinOneEdit(key, menuKey)) return true;
      }
    }

    return false;
  };

  return {
    onMenu: (name: string) => {
      const cached = memo.get(name);
      if (cached !== undefined) return cached;
      const result = test(name);
      memo.set(name, result);
      return result;
    },
    suggest: (name: string, limit = 3): MenuSuggestion[] => {
      const tokens = tokensOf(name);
      if (tokens.size === 0) return [];
      const key = looseKey(tokens);
      return entries
        .map((e) => ({ name: e.display, score: similarity(tokens, key, e.tokens, e.key) }))
        // Below this the "suggestion" is noise and offering it invites a bad
        // mapping — better to leave the line unmatched and let the owner pick.
        .filter((s) => s.score >= 0.25)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "tr"))
        .slice(0, limit);
    },
    digest: [...exact].sort().join(","),
    size: exact.size,
  };
}
