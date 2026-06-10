import { XMLParser } from 'fast-xml-parser';

/** Safely convert an unknown XML attribute value to string. */
function attrToString(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return '';
}

export interface ParsedStatute {
  bwb_id: string;
  title: string;
  /**
   * ISO-8601 in-force date from the BWB `toestand@inwerkingtreding` attribute
   * (e.g. "2018-05-25"). Undefined for legacy/test fixtures that don't include
   * the `<toestand>` wrapper.
   */
  in_force_date?: string;
  provisions: ParsedProvision[];
}

export interface ParsedProvision {
  provision_ref: string; // e.g., "6:162" or "287"
  book?: string;
  chapter?: string;
  section?: string;
  article: string;
  title?: string;
  content: string; // Full text content of the artikel
}

/**
 * Ensure a value is always an array. fast-xml-parser returns a single object
 * when there is only one child element, and an array when there are multiple.
 */
function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Recursively extract all text content from a node.
 * Handles nested elements like `<al>`, `<extref>`, `<nadruk>`, etc.
 */
function extractText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);

  if (typeof node === 'object') {
    // It might be a node with #text and child elements
    const obj = node as Record<string, unknown>;

    // If it has #text, that's the text content (possibly mixed with child elements)
    if ('#text' in obj) {
      return String(obj['#text']);
    }

    // Otherwise, concatenate all values recursively
    const parts: string[] = [];
    for (const key of Object.keys(obj)) {
      if (key.startsWith('@_')) continue; // skip attributes
      parts.push(extractText(obj[key]));
    }
    return parts.filter(Boolean).join(' ');
  }

  return '';
}

/**
 * Extract the text content of an artikel element by collecting text from
 * all `lid > al` elements or direct `al` elements.
 */
function extractArtikelContent(artikel: Record<string, unknown>): string {
  const parts: string[] = [];

  // Try lid elements first
  const leden = toArray(artikel['lid']);
  if (leden.length > 0) {
    for (const lid of leden) {
      if (lid == null || typeof lid !== 'object') continue;
      const lidObj = lid as Record<string, unknown>;
      const lidNr = lidObj['@_nr'] ?? getKopNr(lidObj);
      const als = toArray(lidObj['al']);
      for (const al of als) {
        const text = extractText(al).trim();
        if (text) {
          const prefix = lidNr ? `${attrToString(lidNr)}. ` : '';
          parts.push(prefix + text);
        }
      }
      // Also check for lista/li inside lid
      const lista = toArray(lidObj['lijst'] ?? lidObj['lista']);
      for (const list of lista) {
        if (list == null || typeof list !== 'object') continue;
        const listObj = list as Record<string, unknown>;
        const items = toArray(listObj['li']);
        for (const item of items) {
          const text = extractText(item).trim();
          if (text) parts.push(text);
        }
      }
    }
  }

  // Also try direct `al` elements (artikels without lid)
  if (leden.length === 0) {
    const directAls = toArray(artikel['al']);
    for (const al of directAls) {
      const text = extractText(al).trim();
      if (text) parts.push(text);
    }
  }

  return parts.join('\n');
}

/**
 * Get the `nr` from a `kop` element, if present.
 */
function getKopNr(node: Record<string, unknown>): string | undefined {
  const kop = node['kop'];
  if (kop == null || typeof kop !== 'object') return undefined;
  const kopObj = kop as Record<string, unknown>;
  const nr = kopObj['nr'];
  if (nr == null) return undefined;
  return extractText(nr).trim() || undefined;
}

/**
 * Get the `titel` from a `kop` element, if present.
 */
function getKopTitel(node: Record<string, unknown>): string | undefined {
  const kop = node['kop'];
  if (kop == null || typeof kop !== 'object') return undefined;
  const kopObj = kop as Record<string, unknown>;
  const titel = kopObj['titel'];
  if (titel == null) return undefined;
  return extractText(titel).trim() || undefined;
}

/**
 * Determine the article number from an artikel element.
 * First tries the `@_nr` attribute, then falls back to `kop > nr`, then to
 * the "Eenig/Enig artikel" convention (pre-war single-article statutes whose
 * sole article carries only a kop label) → ref 'enig'.
 */
function getArticleNumber(artikel: Record<string, unknown>): string {
  // Try @_nr attribute first
  const attrNr = attrToString(artikel['@_nr']);
  if (attrNr) return attrNr.trim();

  // Fall back to kop > nr
  const kopNr = getKopNr(artikel);
  if (kopNr) return kopNr;

  // Single-article statutes: kop label (or @_label) reads "Eenig artikel" /
  // "Enig artikel" with no number anywhere.
  const kop = artikel['kop'];
  const kopLabel =
    kop != null && typeof kop === 'object'
      ? extractText((kop as Record<string, unknown>)['label']).trim()
      : '';
  const label = kopLabel || attrToString(artikel['@_label']).trim();
  if (/^ee?nig artikel$/i.test(label)) return 'enig';

  return '';
}

/**
 * Check if a book number is numeric (indicating it should be used in provision_ref).
 * Roman numerals and text like "Tweede Boek" are NOT numeric.
 */
function isNumericBook(bookNr: string): boolean {
  return /^\d+$/.test(bookNr.trim());
}

interface HierarchyContext {
  book?: string;
  chapter?: string;
  section?: string;
}

/**
 * Recursively traverse the XML structure to find all artikel elements,
 * collecting hierarchy information along the way.
 */
function collectArtikels(
  node: unknown,
  context: HierarchyContext,
  provisions: ParsedProvision[],
): void {
  if (node == null || typeof node !== 'object') return;

  const obj = node as Record<string, unknown>;

  // Process boek elements
  for (const boek of toArray(obj['boek'])) {
    if (boek == null || typeof boek !== 'object') continue;
    const boekObj = boek as Record<string, unknown>;
    const boekNr = (attrToString(boekObj['@_nr']).trim() || undefined) ?? getKopNr(boekObj);

    const newContext: HierarchyContext = {
      ...context,
      book: boekNr && isNumericBook(boekNr) ? boekNr : context.book,
    };
    collectArtikels(boekObj, newContext, provisions);
  }

  // Process deel (part-level wrapper above hoofdstuk — Aanbestedingswet 2012
  // uses wettekst > deel > hoofdstuk; without this the whole statute parses
  // to zero provisions).
  for (const deel of toArray(obj['deel'])) {
    if (deel == null || typeof deel !== 'object') continue;
    collectArtikels(deel as Record<string, unknown>, context, provisions);
  }

  // Process hoofdstuk (chapter-level, used in Grondwet, Awb, etc.)
  for (const hoofdstuk of toArray(obj['hoofdstuk'])) {
    if (hoofdstuk == null || typeof hoofdstuk !== 'object') continue;
    const hoofdstukObj = hoofdstuk as Record<string, unknown>;
    const chapterNr = getKopNr(hoofdstukObj);
    const newContext: HierarchyContext = {
      ...context,
      chapter: chapterNr ?? context.chapter,
    };
    collectArtikels(hoofdstukObj, newContext, provisions);
  }

  // Process titeldeel (chapter-level)
  for (const titeldeel of toArray(obj['titeldeel'])) {
    if (titeldeel == null || typeof titeldeel !== 'object') continue;
    const titeldeelObj = titeldeel as Record<string, unknown>;
    const chapterNr = getKopNr(titeldeelObj);
    const newContext: HierarchyContext = {
      ...context,
      chapter: chapterNr ?? context.chapter,
    };
    collectArtikels(titeldeelObj, newContext, provisions);
  }

  // Process afdeling (section-level)
  for (const afdeling of toArray(obj['afdeling'])) {
    if (afdeling == null || typeof afdeling !== 'object') continue;
    const afdelingObj = afdeling as Record<string, unknown>;
    const sectionNr = getKopNr(afdelingObj);
    const newContext: HierarchyContext = {
      ...context,
      section: sectionNr ?? context.section,
    };
    collectArtikels(afdelingObj, newContext, provisions);
  }

  // Process paragraaf (sub-section level)
  for (const paragraaf of toArray(obj['paragraaf'])) {
    if (paragraaf == null || typeof paragraaf !== 'object') continue;
    collectArtikels(paragraaf as Record<string, unknown>, context, provisions);
  }

  // Process artikel elements at this level
  for (const artikel of toArray(obj['artikel'])) {
    if (artikel == null || typeof artikel !== 'object') continue;
    const artikelObj = artikel as Record<string, unknown>;

    const articleNr = getArticleNumber(artikelObj);
    if (!articleNr) continue;

    const artikelTitle = getKopTitel(artikelObj);
    const content = extractArtikelContent(artikelObj);

    // Build provision_ref: only use book:article if book is numeric
    const provisionRef = context.book ? `${context.book}:${articleNr}` : articleNr;

    provisions.push({
      provision_ref: provisionRef,
      book: context.book,
      chapter: context.chapter,
      section: context.section,
      article: articleNr,
      title: artikelTitle,
      content,
    });
  }
}

/**
 * Parse a BWB "toestand" XML document from wetten.overheid.nl into
 * structured provisions.
 */
export function parseBwbXml(xml: string): ParsedStatute {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name: string) =>
      [
        'boek',
        'deel',
        'hoofdstuk',
        'titeldeel',
        'afdeling',
        'paragraaf',
        'artikel',
        'lid',
        'al',
      ].includes(name),
  });

  const doc = parser.parse(xml) as Record<string, unknown>;

  // Navigate the XML structure. Real BWB toestand XMLs use:
  //   <toestand bwb-id="..."> <wetgeving> <wet-besluit> <wettekst> ... </wettekst> </wet-besluit> </wetgeving> </toestand>
  // But the test fixtures may use a simpler structure:
  //   <wet-besluit> <wetgeving> ... </wetgeving> </wet-besluit>
  const toestand = doc['toestand'] as Record<string, unknown> | undefined;

  let wetgeving: Record<string, unknown> | undefined;
  let bwbId = '';
  let inForceDate: string | undefined;

  if (toestand) {
    // Real toestand XML: toestand > wetgeving
    bwbId = attrToString(toestand['@_bwb-id']);
    // The toestand root carries an `inwerkingtreding="YYYY-MM-DD"` attribute
    // recording when this versioned text became in force. Capture it so the
    // ingest pipeline can populate legal_documents.in_force_date — the source
    // of effective_date in citation envelopes (see get-provision.ts:59,81,121).
    const rawDate = attrToString(toestand['@_inwerkingtreding']).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      inForceDate = rawDate;
    }
    wetgeving = toestand['wetgeving'] as Record<string, unknown> | undefined;
  } else {
    // Legacy/test format: wet-besluit > wetgeving
    const wetBesluit = doc['wet-besluit'] as Record<string, unknown> | undefined;
    if (!wetBesluit) {
      return { bwb_id: '', title: '', provisions: [] };
    }
    wetgeving = wetBesluit['wetgeving'] as Record<string, unknown> | undefined;
  }

  if (!wetgeving) {
    return { bwb_id: bwbId, title: '', in_force_date: inForceDate, provisions: [] };
  }

  // Extract BWB-ID (may be on wetgeving if not on toestand)
  if (!bwbId) {
    bwbId = attrToString(wetgeving['@_bwb-id']);
  }

  // Extract title from intitule or citeertitel
  const intitule = wetgeving['intitule'];
  const citeertitel = wetgeving['citeertitel'];
  const title =
    (intitule ? extractText(intitule).trim() : '') ||
    (citeertitel ? extractText(citeertitel).trim() : '');

  // Navigate to the content container — different structures exist:
  //   Wetten:     wetgeving > wet-besluit > wettekst
  //   Regelingen: wetgeving > regeling > regeling-tekst
  //   Fallback:   wetgeving > wettekst (direct)
  const wetBesluitInner = wetgeving['wet-besluit'] as Record<string, unknown> | undefined;
  const regelingInner = wetgeving['regeling'] as Record<string, unknown> | undefined;

  const contentRoot =
    wetBesluitInner?.['wettekst'] ??
    regelingInner?.['regeling-tekst'] ??
    wetgeving['wettekst'] ??
    wetgeving['regeling-tekst'];

  if (!contentRoot || typeof contentRoot !== 'object') {
    return { bwb_id: bwbId, title, in_force_date: inForceDate, provisions: [] };
  }

  // Collect all provisions by traversing the hierarchy
  const provisions: ParsedProvision[] = [];
  collectArtikels(contentRoot as Record<string, unknown>, {}, provisions);

  return { bwb_id: bwbId, title, in_force_date: inForceDate, provisions };
}
