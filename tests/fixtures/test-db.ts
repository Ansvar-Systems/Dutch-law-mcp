/**
 * In-memory Dutch law test database fixture.
 *
 * Creates a fully populated SQLite database with FTS5 indexes,
 * triggers, and representative sample data for Dutch legal research tests.
 */
import Database from '@ansvar/mcp-sqlite';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('statute', 'amvb', 'ministerial_regulation', 'kamerstuk', 'case_law')),
  title TEXT NOT NULL,
  title_en TEXT,
  short_name TEXT,
  status TEXT NOT NULL DEFAULT 'in_force'
    CHECK(status IN ('in_force', 'amended', 'repealed', 'not_yet_in_force')),
  issued_date TEXT,
  in_force_date TEXT,
  url TEXT,
  description TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

CREATE TABLE legal_provisions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  book TEXT,
  chapter TEXT,
  section TEXT,
  article TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  UNIQUE(document_id, provision_ref)
);

CREATE INDEX idx_provisions_doc ON legal_provisions(document_id);
CREATE INDEX idx_provisions_book ON legal_provisions(document_id, book);
CREATE INDEX idx_provisions_chapter ON legal_provisions(document_id, chapter);

CREATE VIRTUAL TABLE provisions_fts USING fts5(
  content, title,
  content='legal_provisions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER provisions_ai AFTER INSERT ON legal_provisions BEGIN
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TRIGGER provisions_ad AFTER DELETE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
END;

CREATE TRIGGER provisions_au AFTER UPDATE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TABLE legal_provision_versions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  book TEXT,
  chapter TEXT,
  section TEXT,
  article TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  valid_from TEXT,
  valid_to TEXT
);

CREATE INDEX idx_provision_versions_doc_ref ON legal_provision_versions(document_id, provision_ref);

CREATE VIRTUAL TABLE provision_versions_fts USING fts5(
  content, title,
  content='legal_provision_versions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER provision_versions_ai AFTER INSERT ON legal_provision_versions BEGIN
  INSERT INTO provision_versions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TRIGGER provision_versions_ad AFTER DELETE ON legal_provision_versions BEGIN
  INSERT INTO provision_versions_fts(provision_versions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
END;

CREATE TRIGGER provision_versions_au AFTER UPDATE ON legal_provision_versions BEGIN
  INSERT INTO provision_versions_fts(provision_versions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
  INSERT INTO provision_versions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TABLE case_law (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE REFERENCES legal_documents(id),
  court TEXT NOT NULL,
  ecli TEXT UNIQUE,
  case_number TEXT,
  decision_date TEXT,
  procedure_type TEXT,
  legal_domain TEXT,
  summary TEXT,
  keywords TEXT
);

CREATE VIRTUAL TABLE case_law_fts USING fts5(
  summary, keywords,
  content='case_law',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER case_law_ai AFTER INSERT ON case_law BEGIN
  INSERT INTO case_law_fts(rowid, summary, keywords)
  VALUES (new.id, new.summary, new.keywords);
END;

CREATE TRIGGER case_law_ad AFTER DELETE ON case_law BEGIN
  INSERT INTO case_law_fts(case_law_fts, rowid, summary, keywords)
  VALUES ('delete', old.id, old.summary, old.keywords);
END;

CREATE TABLE preparatory_works (
  id INTEGER PRIMARY KEY,
  statute_id TEXT NOT NULL REFERENCES legal_documents(id),
  prep_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  kamerstuk_ref TEXT,
  document_type TEXT,
  title TEXT,
  summary TEXT
);

CREATE INDEX idx_prep_statute ON preparatory_works(statute_id);

CREATE VIRTUAL TABLE prep_works_fts USING fts5(
  title, summary,
  content='preparatory_works',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER prep_works_ai AFTER INSERT ON preparatory_works BEGIN
  INSERT INTO prep_works_fts(rowid, title, summary)
  VALUES (new.id, new.title, new.summary);
END;

CREATE TRIGGER prep_works_ad AFTER DELETE ON preparatory_works BEGIN
  INSERT INTO prep_works_fts(prep_works_fts, rowid, title, summary)
  VALUES ('delete', old.id, old.title, old.summary);
END;

CREATE TABLE agency_guidance (
  id INTEGER PRIMARY KEY,
  agency TEXT NOT NULL,
  document_id TEXT,
  title TEXT,
  summary TEXT,
  full_text TEXT,
  issued_date TEXT,
  url TEXT,
  related_statute_id TEXT
);

CREATE VIRTUAL TABLE agency_guidance_fts USING fts5(
  title, summary, full_text,
  content='agency_guidance',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER agency_guidance_ai AFTER INSERT ON agency_guidance BEGIN
  INSERT INTO agency_guidance_fts(rowid, title, summary, full_text)
  VALUES (new.id, new.title, new.summary, new.full_text);
END;

CREATE TRIGGER agency_guidance_ad AFTER DELETE ON agency_guidance BEGIN
  INSERT INTO agency_guidance_fts(agency_guidance_fts, rowid, title, summary, full_text)
  VALUES ('delete', old.id, old.title, old.summary, old.full_text);
END;

CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  source_provision_ref TEXT,
  target_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  target_provision_ref TEXT,
  ref_type TEXT NOT NULL DEFAULT 'references'
    CHECK(ref_type IN ('references', 'amended_by', 'implements', 'see_also'))
);

CREATE INDEX idx_xref_source ON cross_references(source_document_id);
CREATE INDEX idx_xref_target ON cross_references(target_document_id);

CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  term TEXT NOT NULL,
  term_en TEXT,
  definition TEXT NOT NULL,
  source_provision TEXT,
  UNIQUE(document_id, term)
);

CREATE VIRTUAL TABLE definitions_fts USING fts5(
  term, definition,
  content='definitions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER definitions_ai AFTER INSERT ON definitions BEGIN
  INSERT INTO definitions_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

CREATE TRIGGER definitions_ad AFTER DELETE ON definitions BEGIN
  INSERT INTO definitions_fts(definitions_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
END;

CREATE TABLE IF NOT EXISTS eu_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('directive', 'regulation', 'decision')),
  year INTEGER NOT NULL,
  number INTEGER NOT NULL,
  community TEXT CHECK(community IN ('EU', 'EG', 'EEG', 'Euratom')),
  celex_number TEXT,
  title TEXT,
  title_nl TEXT,
  short_name TEXT,
  adoption_date TEXT,
  entry_into_force_date TEXT,
  in_force BOOLEAN DEFAULT 1,
  amended_by TEXT,
  repeals TEXT,
  url_eur_lex TEXT,
  description TEXT,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eu_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK(source_type IN ('provision', 'document', 'case_law')),
  source_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_id INTEGER REFERENCES legal_provisions(id),
  eu_document_id TEXT NOT NULL REFERENCES eu_documents(id),
  eu_article TEXT,
  reference_type TEXT NOT NULL CHECK(reference_type IN (
    'implements', 'supplements', 'applies', 'references', 'complies_with',
    'derogates_from', 'amended_by', 'repealed_by', 'cites_article'
  )),
  reference_context TEXT,
  full_citation TEXT,
  is_primary_implementation BOOLEAN DEFAULT 0,
  implementation_status TEXT CHECK(implementation_status IN ('complete', 'partial', 'pending', 'unknown')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_verified TEXT,
  UNIQUE(source_id, eu_document_id, eu_article)
);

CREATE INDEX IF NOT EXISTS idx_eu_references_document ON eu_references(document_id, eu_document_id);
CREATE INDEX IF NOT EXISTS idx_eu_references_eu_document ON eu_references(eu_document_id, document_id);
CREATE INDEX IF NOT EXISTS idx_eu_references_provision ON eu_references(provision_id, eu_document_id);
`;

// ---------------------------------------------------------------------------
// Sample Data
// ---------------------------------------------------------------------------

const SAMPLE_DOCUMENTS = [
  {
    id: 'BWBR0005289',
    type: 'statute',
    title: 'Burgerlijk Wetboek Boek 6',
    title_en: 'Civil Code Book 6',
    short_name: 'BW 6',
    status: 'in_force',
    issued_date: '1992-01-01',
    in_force_date: '1992-01-01',
    url: 'https://wetten.overheid.nl/BWBR0005289',
    description: 'Verbintenissenrecht',
  },
  {
    id: 'BWBR0001854',
    type: 'statute',
    title: 'Wetboek van Strafrecht',
    title_en: 'Criminal Code',
    short_name: 'Sr',
    status: 'in_force',
    issued_date: '1886-03-03',
    in_force_date: '1886-09-01',
    url: 'https://wetten.overheid.nl/BWBR0001854',
    description: 'Strafrecht',
  },
  {
    id: 'BWBR0005537',
    type: 'statute',
    title: 'Algemene wet bestuursrecht',
    title_en: 'General Administrative Law Act',
    short_name: 'Awb',
    status: 'in_force',
    issued_date: '1992-06-04',
    in_force_date: '1994-01-01',
    url: 'https://wetten.overheid.nl/BWBR0005537',
    description: 'Bestuursrecht',
  },
  {
    id: 'BWBR0001840',
    type: 'statute',
    title: 'Grondwet',
    title_en: 'Constitution',
    short_name: 'Gw',
    status: 'in_force',
    issued_date: '1815-08-24',
    in_force_date: '1815-08-24',
    url: 'https://wetten.overheid.nl/BWBR0001840',
    description: 'Grondwet voor het Koninkrijk der Nederlanden',
  },
  {
    id: 'BWBR0042124',
    type: 'statute',
    title: 'Uitvoeringswet Algemene verordening gegevensbescherming',
    title_en: 'GDPR Implementation Act',
    short_name: 'UAVG',
    status: 'in_force',
    issued_date: '2018-05-16',
    in_force_date: '2018-05-25',
    url: 'https://wetten.overheid.nl/BWBR0042124',
    description: 'Uitvoering van de Algemene verordening gegevensbescherming',
  },
  {
    id: 'BWBR0011823',
    type: 'statute',
    title: 'Wet bescherming persoonsgegevens',
    title_en: 'Personal Data Protection Act',
    short_name: 'Wbp',
    status: 'repealed',
    issued_date: '2000-07-06',
    in_force_date: '2001-09-01',
    url: null,
    description: 'Ingetrokken 2018-05-25 door UAVG',
  },
  {
    id: 'KST-35815-2',
    type: 'kamerstuk',
    title: 'Wijziging van de Uitvoeringswet AVG',
    title_en: null,
    short_name: null,
    status: 'in_force',
    issued_date: '2021-03-15',
    in_force_date: null,
    url: null,
    description: 'Kamerstukken II 2020/21, 35815, nr. 2',
  },
  {
    id: 'ECLI:NL:HR:2019:376',
    type: 'case_law',
    title: 'Hoge Raad 15 maart 2019',
    title_en: null,
    short_name: null,
    status: 'in_force',
    issued_date: '2019-03-15',
    in_force_date: null,
    url: 'https://uitspraken.rechtspraak.nl/details?id=ECLI:NL:HR:2019:376',
    description: 'Onrechtmatige daad; schadevergoeding',
  },
  {
    id: 'INT-CASE-NULL-ECLI-001',
    type: 'case_law',
    title: 'Internal case identifier (no ECLI assigned)',
    title_en: null,
    short_name: null,
    status: 'in_force',
    issued_date: '2024-01-15',
    in_force_date: null,
    url: null,
    description: 'Synthetic fixture for null-ecli lookup keying test',
  },
  {
    id: 'ECLI:NL:RVS:2020:1234',
    type: 'case_law',
    title: 'Raad van State 10 juni 2020',
    title_en: null,
    short_name: null,
    status: 'in_force',
    issued_date: '2020-06-10',
    in_force_date: null,
    url: null,
    description: 'Bestuursrechtelijke handhaving',
  },
];

const SAMPLE_PROVISIONS = [
  {
    document_id: 'BWBR0005289',
    provision_ref: '6:162',
    book: '6',
    chapter: null,
    section: '9',
    article: '162',
    title: 'Onrechtmatige daad',
    content:
      'Hij die jegens een ander een onrechtmatige daad pleegt, welke hem kan worden toegerekend, is verplicht de schade die de ander dientengevolge lijdt, te vergoeden.',
  },
  {
    document_id: 'BWBR0005289',
    provision_ref: '6:163',
    book: '6',
    chapter: null,
    section: '9',
    article: '163',
    title: 'Relativiteit',
    content:
      'Geen verplichting tot schadevergoeding bestaat, wanneer de geschonden norm niet strekt tot bescherming tegen de schade zoals de benadeelde die heeft geleden.',
  },
  {
    document_id: 'BWBR0005289',
    provision_ref: '6:174',
    book: '6',
    chapter: null,
    section: '11',
    article: '174',
    title: 'Aansprakelijkheid bezitter gebrekkige zaak',
    content:
      'De bezitter van een roerende zaak waarvan bekend is dat zij, zo zij niet voldoet aan de eisen die men in de gegeven omstandigheden aan de zaak mag stellen, een bijzonder gevaar voor personen of zaken oplevert, is, wanneer dit gevaar zich verwezenlijkt, aansprakelijk, tenzij aansprakelijkheid op grond van de vorige afdeling zou hebben ontbroken indien hij dit gevaar op het tijdstip van het ontstaan daarvan zou hebben gekend.',
  },
  {
    document_id: 'BWBR0001854',
    provision_ref: '287',
    book: null,
    chapter: '19',
    section: null,
    article: '287',
    title: 'Doodslag',
    content:
      'Hij die opzettelijk een ander van het leven berooft, wordt, als schuldig aan doodslag, gestraft met gevangenisstraf van ten hoogste vijftien jaren of geldboete van de vijfde categorie.',
  },
  {
    document_id: 'BWBR0001854',
    provision_ref: '310',
    book: null,
    chapter: '22',
    section: null,
    article: '310',
    title: 'Diefstal',
    content:
      'Hij die enig goed dat geheel of ten dele aan een ander toebehoort wegneemt, met het oogmerk om het zich wederrechtelijk toe te eigenen, wordt, als schuldig aan diefstal, gestraft met gevangenisstraf van ten hoogste vier jaren of geldboete van de vierde categorie.',
  },
  {
    document_id: 'BWBR0005537',
    provision_ref: '8:1',
    book: null,
    chapter: '8',
    section: null,
    article: '1',
    title: 'Beroep bij de bestuursrechter',
    content: 'Een belanghebbende kan tegen een besluit beroep instellen bij de bestuursrechter.',
  },
  {
    document_id: 'BWBR0001840',
    provision_ref: '1',
    book: null,
    chapter: '1',
    section: null,
    article: '1',
    title: 'Gelijke behandeling',
    content:
      'Allen die zich in Nederland bevinden, worden in gelijke gevallen gelijk behandeld. Discriminatie wegens godsdienst, levensovertuiging, politieke gezindheid, ras, geslacht of op welke grond dan ook, is niet toegestaan.',
  },
  {
    document_id: 'BWBR0042124',
    provision_ref: '1',
    book: null,
    chapter: '1',
    section: null,
    article: '1',
    title: 'Begripsbepalingen',
    content:
      'In deze wet en de daarop berustende bepalingen wordt verstaan onder: verordening: Verordening (EU) 2016/679 van het Europees Parlement en de Raad van 27 april 2016 betreffende de bescherming van natuurlijke personen in verband met de verwerking van persoonsgegevens en betreffende het vrije verkeer van die gegevens en tot intrekking van Richtlijn 95/46/EG (algemene verordening gegevensbescherming).',
  },
  {
    document_id: 'BWBR0042124',
    provision_ref: '2',
    book: null,
    chapter: '1',
    section: null,
    article: '2',
    title: 'Toepassingsgebied',
    content:
      'Deze wet is van toepassing op de geheel of gedeeltelijk geautomatiseerde verwerking van persoonsgegevens, alsmede op de niet geautomatiseerde verwerking van persoonsgegevens die in een bestand zijn opgenomen of die bestemd zijn om daarin te worden opgenomen.',
  },
  {
    document_id: 'BWBR0042124',
    provision_ref: '30',
    book: null,
    chapter: '4',
    section: null,
    article: '30',
    title: 'Autoriteit Persoonsgegevens',
    content:
      'De Autoriteit Persoonsgegevens is de toezichthoudende autoriteit, bedoeld in artikel 51 van de verordening.',
  },
  {
    document_id: 'BWBR0011823',
    provision_ref: '1',
    book: null,
    chapter: '1',
    section: null,
    article: '1',
    title: 'Begripsbepalingen',
    content:
      'In deze wet en de daarop berustende bepalingen wordt verstaan onder: persoonsgegeven: elk gegeven betreffende een geidentificeerde of identificeerbare natuurlijke persoon.',
  },
];

const SAMPLE_PROVISION_VERSIONS = [
  // UAVG art 30 - current version
  {
    document_id: 'BWBR0042124',
    provision_ref: '30',
    book: null,
    chapter: '4',
    section: null,
    article: '30',
    title: 'Autoriteit Persoonsgegevens',
    content:
      'De Autoriteit Persoonsgegevens is de toezichthoudende autoriteit, bedoeld in artikel 51 van de verordening.',
    valid_from: '2018-05-25',
    valid_to: null,
  },
  // BW 6:162 - current
  {
    document_id: 'BWBR0005289',
    provision_ref: '6:162',
    book: '6',
    chapter: null,
    section: '9',
    article: '162',
    title: 'Onrechtmatige daad',
    content:
      'Hij die jegens een ander een onrechtmatige daad pleegt, welke hem kan worden toegerekend, is verplicht de schade die de ander dientengevolge lijdt, te vergoeden.',
    valid_from: '1992-01-01',
    valid_to: null,
  },
  // Wbp art 1 - repealed
  {
    document_id: 'BWBR0011823',
    provision_ref: '1',
    book: null,
    chapter: '1',
    section: null,
    article: '1',
    title: 'Begripsbepalingen',
    content:
      'In deze wet en de daarop berustende bepalingen wordt verstaan onder: persoonsgegeven: elk gegeven betreffende een geidentificeerde of identificeerbare natuurlijke persoon.',
    valid_from: '2001-09-01',
    valid_to: '2018-05-25',
  },
];

const SAMPLE_CASE_LAW = [
  {
    document_id: 'ECLI:NL:HR:2019:376',
    court: 'HR',
    ecli: 'ECLI:NL:HR:2019:376',
    case_number: '17/04835',
    decision_date: '2019-03-15',
    procedure_type: 'Cassatie',
    legal_domain: 'Civiel recht',
    summary:
      'De Hoge Raad oordeelde over de vereisten van onrechtmatige daad (art. 6:162 BW) in het kader van aansprakelijkheid voor gebrekkige producten.',
    keywords: 'onrechtmatige daad schadevergoeding aansprakelijkheid productaansprakelijkheid',
  },
  {
    document_id: 'ECLI:NL:RVS:2020:1234',
    court: 'RVS',
    ecli: 'ECLI:NL:RVS:2020:1234',
    case_number: '201905678/1/A3',
    decision_date: '2020-06-10',
    procedure_type: 'Hoger beroep',
    legal_domain: 'Bestuursrecht',
    summary:
      'De Afdeling bestuursrechtspraak van de Raad van State bevestigde het besluit van het bestuursorgaan inzake handhaving op grond van de Algemene wet bestuursrecht.',
    keywords: 'bestuursrecht handhaving Awb besluit bestuursorgaan',
  },
  {
    document_id: 'INT-CASE-NULL-ECLI-001',
    court: 'CBb',
    ecli: null,
    case_number: 'INT-2024-001',
    decision_date: '2024-01-15',
    procedure_type: 'Bezwaar',
    legal_domain: 'Bestuursrecht',
    summary: 'synthetisch fixture nullecli token',
    keywords: 'nullecli synthetisch fixture',
  },
];

const SAMPLE_PREPARATORY_WORKS = [
  {
    statute_id: 'BWBR0042124',
    prep_document_id: 'KST-35815-2',
    kamerstuk_ref: 'Kamerstukken II 2020/21, 35815, nr. 2',
    document_type: 'MvT',
    title: 'Wijziging van de Uitvoeringswet AVG',
    summary:
      'Memorie van Toelichting bij de wijziging van de Uitvoeringswet Algemene verordening gegevensbescherming.',
  },
];

const SAMPLE_AGENCY_GUIDANCE = [
  {
    agency: 'tweede-kamer',
    document_id: null,
    title: '2020-03-12 — KathalijneBuitenweg',
    summary: 'GroenLinks fractie, debat over privacy',
    full_text:
      'Voorzitter, de bescherming van persoonsgegevens is een grondrecht. De Autoriteit Persoonsgegevens heeft herhaaldelijk gewezen op de risicos van grootschalige gegevensverwerking door overheidsinstellingen.',
    issued_date: '2020-03-12',
    url: 'https://www.tweedekamer.nl/kamerstukken/plenaire_verslagen',
    related_statute_id: 'BWBR0042124',
  },
  {
    agency: 'tweede-kamer',
    document_id: null,
    title: '2021-06-15 — TobiasvanGent',
    summary: 'D66 fractie, debat over digitalisering',
    full_text:
      'De digitale transformatie van onze samenleving brengt nieuwe uitdagingen met zich mee voor de bescherming van grondrechten. Wij pleiten voor een wettelijk kader dat innovatie mogelijk maakt en tegelijkertijd privacy waarborgt.',
    issued_date: '2021-06-15',
    url: 'https://www.tweedekamer.nl/kamerstukken/plenaire_verslagen',
    related_statute_id: null,
  },
  {
    agency: 'tweede-kamer',
    document_id: null,
    title: '2019-11-20 — PieterOmtzigt',
    summary: 'CDA fractie, debat over toeslagenaffaire',
    full_text:
      'De gang van zaken bij de Belastingdienst rondom de kinderopvangtoeslag is onacceptabel. Duizenden gezinnen zijn ten onrechte als fraudeur bestempeld op basis van geautomatiseerde risicoprofilering zonder adequate menselijke toetsing.',
    issued_date: '2019-11-20',
    url: 'https://www.tweedekamer.nl/kamerstukken/plenaire_verslagen',
    related_statute_id: null,
  },
];

const SAMPLE_DEFINITIONS = [
  {
    document_id: 'BWBR0042124',
    term: 'verordening',
    term_en: 'regulation',
    definition: 'Verordening (EU) 2016/679 (AVG/GDPR)',
    source_provision: '1',
  },
  {
    document_id: 'BWBR0042124',
    term: 'Autoriteit Persoonsgegevens',
    term_en: 'Data Protection Authority',
    definition: 'De toezichthoudende autoriteit bedoeld in artikel 51 van de verordening.',
    source_provision: '30',
  },
  {
    document_id: 'BWBR0001840',
    term: 'discriminatie',
    term_en: 'discrimination',
    definition:
      'Discriminatie wegens godsdienst, levensovertuiging, politieke gezindheid, ras, geslacht of op welke grond dan ook.',
    source_provision: '1',
  },
];

const SAMPLE_CROSS_REFS = [
  {
    source_document_id: 'BWBR0042124',
    source_provision_ref: '1',
    target_document_id: 'BWBR0011823',
    target_provision_ref: null,
    ref_type: 'amended_by',
  },
  {
    source_document_id: 'ECLI:NL:HR:2019:376',
    source_provision_ref: null,
    target_document_id: 'BWBR0005289',
    target_provision_ref: '6:162',
    ref_type: 'references',
  },
];

const SAMPLE_EU_DOCUMENTS = [
  {
    id: 'regulation:2016/679',
    type: 'regulation',
    year: 2016,
    number: 679,
    community: 'EU',
    celex_number: '32016R0679',
    title:
      'Regulation (EU) 2016/679 on the protection of natural persons with regard to the processing of personal data',
    title_nl:
      'Verordening (EU) 2016/679 betreffende de bescherming van natuurlijke personen in verband met de verwerking van persoonsgegevens',
    short_name: 'AVG',
    adoption_date: '2016-04-27',
    entry_into_force_date: '2018-05-25',
    in_force: 1,
    amended_by: null,
    repeals: null,
    url_eur_lex: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
    description: 'General Data Protection Regulation (GDPR/AVG)',
  },
  {
    id: 'directive:95/46',
    type: 'directive',
    year: 1995,
    number: 46,
    community: 'EG',
    celex_number: '31995L0046',
    title:
      'Directive 95/46/EC on the protection of individuals with regard to the processing of personal data',
    title_nl:
      'Richtlijn 95/46/EG betreffende de bescherming van natuurlijke personen in verband met de verwerking van persoonsgegevens',
    short_name: 'Privacyrichtlijn',
    adoption_date: '1995-10-24',
    entry_into_force_date: '1995-10-24',
    in_force: 0,
    amended_by: '["regulation:2016/679"]',
    repeals: null,
    url_eur_lex: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31995L0046',
    description: 'Repealed by GDPR/AVG on 2018-05-25',
  },
];

const SAMPLE_EU_REFERENCES = [
  {
    source_type: 'document',
    source_id: 'BWBR0042124',
    document_id: 'BWBR0042124',
    provision_id: null,
    eu_document_id: 'regulation:2016/679',
    eu_article: null,
    reference_type: 'supplements',
    full_citation: 'AVG (EU) 2016/679',
    is_primary_implementation: 1,
    implementation_status: 'complete',
  },
  {
    source_type: 'provision',
    source_id: 'BWBR0042124:30',
    document_id: 'BWBR0042124',
    provision_id: 10,
    eu_document_id: 'regulation:2016/679',
    eu_article: '51',
    reference_type: 'cites_article',
    full_citation: 'AVG Article 51',
    is_primary_implementation: 0,
    implementation_status: null,
  },
  {
    source_type: 'document',
    source_id: 'BWBR0011823',
    document_id: 'BWBR0011823',
    provision_id: null,
    eu_document_id: 'directive:95/46',
    eu_article: null,
    reference_type: 'implements',
    full_citation: 'Richtlijn 95/46/EG',
    is_primary_implementation: 1,
    implementation_status: 'complete',
  },
];

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Create an in-memory SQLite database populated with the Dutch law schema
 * and all sample data. Suitable for unit and integration tests.
 */
export function createTestDatabase(): InstanceType<typeof Database> {
  const db = new Database(':memory:');

  // Enable foreign key enforcement
  db.pragma('foreign_keys = ON');

  // Create all tables, indexes, FTS tables, and triggers
  db.exec(SCHEMA);

  // -- Insert sample data inside a transaction for speed --
  const insertAll = db.transaction(() => {
    // Legal documents
    const insertDoc = db.prepare(
      `INSERT INTO legal_documents (id, type, title, title_en, short_name, status, issued_date, in_force_date, url, description)
       VALUES (@id, @type, @title, @title_en, @short_name, @status, @issued_date, @in_force_date, @url, @description)`,
    );
    for (const doc of SAMPLE_DOCUMENTS) {
      insertDoc.run(doc);
    }

    // Legal provisions
    const insertProv = db.prepare(
      `INSERT INTO legal_provisions (document_id, provision_ref, book, chapter, section, article, title, content)
       VALUES (@document_id, @provision_ref, @book, @chapter, @section, @article, @title, @content)`,
    );
    for (const prov of SAMPLE_PROVISIONS) {
      insertProv.run(prov);
    }

    // Provision versions
    const insertProvVer = db.prepare(
      `INSERT INTO legal_provision_versions (document_id, provision_ref, book, chapter, section, article, title, content, valid_from, valid_to)
       VALUES (@document_id, @provision_ref, @book, @chapter, @section, @article, @title, @content, @valid_from, @valid_to)`,
    );
    for (const ver of SAMPLE_PROVISION_VERSIONS) {
      insertProvVer.run(ver);
    }

    // Case law
    const insertCase = db.prepare(
      `INSERT INTO case_law (document_id, court, ecli, case_number, decision_date, procedure_type, legal_domain, summary, keywords)
       VALUES (@document_id, @court, @ecli, @case_number, @decision_date, @procedure_type, @legal_domain, @summary, @keywords)`,
    );
    for (const cl of SAMPLE_CASE_LAW) {
      insertCase.run(cl);
    }

    // Preparatory works
    const insertPrep = db.prepare(
      `INSERT INTO preparatory_works (statute_id, prep_document_id, kamerstuk_ref, document_type, title, summary)
       VALUES (@statute_id, @prep_document_id, @kamerstuk_ref, @document_type, @title, @summary)`,
    );
    for (const pw of SAMPLE_PREPARATORY_WORKS) {
      insertPrep.run(pw);
    }

    // Definitions
    const insertDef = db.prepare(
      `INSERT INTO definitions (document_id, term, term_en, definition, source_provision)
       VALUES (@document_id, @term, @term_en, @definition, @source_provision)`,
    );
    for (const def of SAMPLE_DEFINITIONS) {
      insertDef.run(def);
    }

    // Agency guidance (parliamentary proceedings)
    const insertGuidance = db.prepare(
      `INSERT INTO agency_guidance (agency, document_id, title, summary, full_text, issued_date, url, related_statute_id)
       VALUES (@agency, @document_id, @title, @summary, @full_text, @issued_date, @url, @related_statute_id)`,
    );
    for (const ag of SAMPLE_AGENCY_GUIDANCE) {
      insertGuidance.run(ag);
    }

    // Cross references
    const insertXref = db.prepare(
      `INSERT INTO cross_references (source_document_id, source_provision_ref, target_document_id, target_provision_ref, ref_type)
       VALUES (@source_document_id, @source_provision_ref, @target_document_id, @target_provision_ref, @ref_type)`,
    );
    for (const xr of SAMPLE_CROSS_REFS) {
      insertXref.run(xr);
    }

    // EU documents
    const insertEuDoc = db.prepare(
      `INSERT INTO eu_documents (id, type, year, number, community, celex_number, title, title_nl, short_name, adoption_date, entry_into_force_date, in_force, amended_by, repeals, url_eur_lex, description)
       VALUES (@id, @type, @year, @number, @community, @celex_number, @title, @title_nl, @short_name, @adoption_date, @entry_into_force_date, @in_force, @amended_by, @repeals, @url_eur_lex, @description)`,
    );
    for (const eu of SAMPLE_EU_DOCUMENTS) {
      insertEuDoc.run(eu);
    }

    // EU references
    const insertEuRef = db.prepare(
      `INSERT INTO eu_references (source_type, source_id, document_id, provision_id, eu_document_id, eu_article, reference_type, full_citation, is_primary_implementation, implementation_status)
       VALUES (@source_type, @source_id, @document_id, @provision_id, @eu_document_id, @eu_article, @reference_type, @full_citation, @is_primary_implementation, @implementation_status)`,
    );
    for (const ref of SAMPLE_EU_REFERENCES) {
      insertEuRef.run(ref);
    }
  });

  insertAll();

  return db;
}

/**
 * Close the test database connection.
 */
export function closeTestDatabase(db: InstanceType<typeof Database>): void {
  db.close();
}

// ---------------------------------------------------------------------------
// Exported sample data (for assertions in tests)
// ---------------------------------------------------------------------------

export const sampleData = {
  documents: SAMPLE_DOCUMENTS,
  provisions: SAMPLE_PROVISIONS,
  provisionVersions: SAMPLE_PROVISION_VERSIONS,
  caseLaw: SAMPLE_CASE_LAW,
  preparatoryWorks: SAMPLE_PREPARATORY_WORKS,
  agencyGuidance: SAMPLE_AGENCY_GUIDANCE,
  definitions: SAMPLE_DEFINITIONS,
  crossReferences: SAMPLE_CROSS_REFS,
  euDocuments: SAMPLE_EU_DOCUMENTS,
  euReferences: SAMPLE_EU_REFERENCES,
};
