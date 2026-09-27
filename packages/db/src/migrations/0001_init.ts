/** Version 1: the full sub-project 1 schema (spec §5.2). One SQL statement per string. */
export const initStatements: string[] = [
  // ===== Synced tables: id / hlc / fhlc / deleted, no foreign keys =====
  `CREATE TABLE article (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    source TEXT,
    lang TEXT,
    import_kind TEXT NOT NULL,
    current_revision_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE article_revision (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    parent_id TEXT,
    blocks TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL
  )`,
  `CREATE TABLE anchor (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    start INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    exact TEXT NOT NULL,
    prefix TEXT NOT NULL,
    suffix TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'range' CHECK (unit IN ('range', 'block')),
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE markup (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    anchor_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('term', 'line', 'paragraph')),
    style TEXT NOT NULL DEFAULT 'default',
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE side_note (
    id TEXT PRIMARY KEY,
    markup_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    body TEXT NOT NULL,
    sort_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE memo (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    home_article_id TEXT,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE memo_update (
    id TEXT PRIMARY KEY,
    memo_id TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL
  )`,
  `CREATE TABLE tag (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    sort_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE tag_edge (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    child_id TEXT NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE tagging (
    id TEXT PRIMARY KEY,
    tag_id TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('article', 'markup', 'side_note', 'memo')),
    entity_id TEXT NOT NULL,
    article_id TEXT,
    created_at INTEGER NOT NULL,
    hlc TEXT NOT NULL,
    fhlc TEXT NOT NULL DEFAULT '{}',
    deleted INTEGER NOT NULL DEFAULT 0
  )`,
  // ===== Sync plumbing =====
  `CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  // ===== Local-only derived tables (rebuildable, never synced) =====
  `CREATE TABLE anchor_res (
    anchor_id TEXT PRIMARY KEY,
    revision_id TEXT NOT NULL,
    start INTEGER,
    "end" INTEGER,
    status TEXT NOT NULL CHECK (status IN ('exact', 'mapped', 'fuzzy', 'orphan')),
    score REAL
  )`,
  `CREATE TABLE memo_link (
    memo_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('anchor', 'markup', 'side_note')),
    target_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    PRIMARY KEY (memo_id, node_id)
  )`,
  `CREATE TABLE memo_cache (memo_id TEXT PRIMARY KEY, text TEXT NOT NULL, snapshot BLOB, snapshot_hlc TEXT)`,
  `CREATE TABLE search_doc (
    rowid INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    article_id TEXT,
    UNIQUE (entity_type, entity_id)
  )`,
  `CREATE VIRTUAL TABLE search_fts USING fts5(
    title, body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2'
  )`,
  // ===== Indexes =====
  `CREATE INDEX article_revision_by_article ON article_revision (article_id)`,
  `CREATE INDEX anchor_by_article ON anchor (article_id)`,
  `CREATE INDEX markup_by_article ON markup (article_id)`,
  `CREATE INDEX side_note_by_markup ON side_note (markup_id)`,
  `CREATE INDEX memo_update_by_memo ON memo_update (memo_id, hlc)`,
  `CREATE INDEX tag_edge_by_parent ON tag_edge (parent_id) WHERE deleted = 0`,
  `CREATE INDEX tag_edge_by_child ON tag_edge (child_id) WHERE deleted = 0`,
  `CREATE INDEX tagging_by_tag ON tagging (tag_id) WHERE deleted = 0`,
  `CREATE INDEX tagging_by_entity ON tagging (entity_type, entity_id)`,
  `CREATE INDEX memo_link_by_target ON memo_link (target_type, target_id)`,
  `CREATE INDEX memo_link_by_article ON memo_link (article_id)`,
];
