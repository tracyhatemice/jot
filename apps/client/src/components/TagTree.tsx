import { descendants } from '@jot/core';
import { addParent, createTag, deleteTag, moveTag, removeParent, renameTag, type TagRow } from '@jot/db';
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isImeKey } from '../data/ime';
import { useLibrary } from '../data/LibraryContext';
import { useReportTagError } from '../tags/errors';
import { useTagIndex } from '../tags/TagContext';
import { buildTagTree, type TagNode } from '../tags/tree';
import { SectionHeading } from './SectionHeading';
import { Chevron, SECTION_ICONS } from './sectionIcons';
import { TagPicker } from './TagPicker';

const DRAG_TYPE = 'application/x-jot-tag';
/** Drop-highlight key of the heading, which takes a dropped tag out of its parent. */
const TOP = '#top';
const INDENT = 14;

/** What is being dragged: a tag, and the parent it was dragged out from (null at the top level). */
interface DraggedTag {
  tagId: string;
  parentId: string | null;
}

interface Props {
  /** Lists everything that carries the tag or one of its subtags. */
  onSelect(tagId: string): void;
  folded: boolean;
  onFold(folded: boolean): void;
}

/**
 * The tag hierarchy (spec §6.4). Drag a tag onto another to move it there, or hold Alt to add that tag
 * as a further parent; drop it on the heading to take it out of its parent. Each row's menu offers the
 * same changes without dragging.
 */
export function TagTree({ onSelect, folded, onFold }: Props) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const report = useReportTagError();
  const { tags, edges, byId } = useTagIndex();
  const tree = useMemo(() => buildTagTree(tags, edges), [tags, edges]);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [pickingParentKey, setPickingParentKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const toggle = (key: string) =>
    setCollapsed((keys) => {
      const next = new Set(keys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** The tag itself, everything below it and its current parents can't be added as its parent. */
  const notParentable = (tagId: string): ReadonlySet<string> => {
    const blocked = descendants(
      edges.map((e) => ({ parent: e.parent_id, child: e.child_id })),
      tagId,
    );
    for (const e of edges) if (e.child_id === tagId) blocked.add(e.parent_id);
    return blocked;
  };

  const dragOver = (e: DragEvent, key: string) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
    setDropKey(key);
  };

  const drop = (e: DragEvent, target: TagRow | null) => {
    e.preventDefault();
    setDropKey(null);
    let dragged: DraggedTag;
    try {
      dragged = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as DraggedTag;
    } catch {
      return;
    }
    if (target === null) {
      if (dragged.parentId) removeParent(lib, dragged.tagId, dragged.parentId).catch(report);
      return;
    }
    if (target.id === dragged.tagId) return; // dropped back onto itself
    const change = e.altKey ? addParent(lib, dragged.tagId, target.id) : moveTag(lib, dragged.tagId, dragged.parentId, target.id);
    change.catch(report);
  };

  const renderNode = (node: TagNode): ReactNode => {
    const { tag, parentId } = node;
    const open = !collapsed.has(node.key);
    // A tag is an item of the Tags section: one indent in, and one more per level (spec §6.12).
    const menuIndent = { marginLeft: (node.depth + 1) * INDENT };
    return (
      <li key={node.key} role="treeitem" aria-level={node.depth + 1} aria-expanded={node.children.length > 0 ? open : undefined}>
        <div
          className={dropKey === node.key ? 'tag-row drop' : 'tag-row'}
          style={menuIndent}
          draggable={renamingKey !== node.key}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ tagId: tag.id, parentId } satisfies DraggedTag));
            e.dataTransfer.effectAllowed = 'copyMove';
          }}
          onDragOver={(e) => dragOver(e, node.key)}
          onDragLeave={() => setDropKey((k) => (k === node.key ? null : k))}
          onDrop={(e) => drop(e, tag)}
          data-testid="tag-row"
          data-tag={tag.name}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              className="icon tag-toggle"
              aria-label={open ? t('tags.collapse') : t('tags.expand')}
              onClick={() => toggle(node.key)}
            >
              <Chevron open={open} />
            </button>
          ) : (
            <span className="tag-toggle" />
          )}
          {renamingKey === node.key ? (
            <NameInput
              label={t('tags.renameLabel', { name: tag.name })}
              initial={tag.name}
              testId="tag-rename-input"
              onDone={(name) => {
                setRenamingKey(null);
                if (name && name !== tag.name) renameTag(lib, tag.id, name).catch(report);
              }}
            />
          ) : (
            <button type="button" className="tag-name" onClick={() => onSelect(tag.id)} data-testid="tag-name">
              {tag.name}
            </button>
          )}
          <button
            type="button"
            className="icon tag-menu-button"
            aria-label={t('tags.menu')}
            aria-haspopup="menu"
            aria-expanded={menuKey === node.key}
            onClick={() => setMenuKey(menuKey === node.key ? null : node.key)}
            data-testid="tag-menu"
          >
            ⋯
          </button>
        </div>
        {menuKey === node.key && (
          <div className="tag-menu" role="menu" style={menuIndent}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuKey(null);
                setRenamingKey(node.key);
              }}
              data-testid="tag-rename"
            >
              {t('tags.rename')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuKey(null);
                setPickingParentKey(node.key);
              }}
              data-testid="tag-add-parent"
            >
              {t('tags.addParent')}
            </button>
            {parentId && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuKey(null);
                  removeParent(lib, tag.id, parentId).catch(report);
                }}
                data-testid="tag-remove-from"
              >
                {t('tags.removeFrom', { name: byId.get(parentId)?.name ?? '' })}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuKey(null);
                if (window.confirm(t('tags.confirmDelete', { name: tag.name }))) deleteTag(lib, tag.id).catch(report);
              }}
              data-testid="tag-delete"
            >
              {t('tags.delete')}
            </button>
          </div>
        )}
        {pickingParentKey === node.key && (
          <div className="tag-parent-picker" style={menuIndent}>
            <TagPicker
              allowCreate
              exclude={notParentable(tag.id)}
              onPick={(parent) => addParent(lib, tag.id, parent.id).catch(report)}
              onCreate={(name) =>
                createTag(lib, { name })
                  .then((newParentId) => addParent(lib, tag.id, newParentId))
                  .catch(report)
              }
              onClose={() => setPickingParentKey(null)}
            />
          </div>
        )}
        {open && node.children.length > 0 && <ul role="group">{node.children.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <section className="tag-tree-section">
      <div
        className={dropKey === TOP ? 'tags-heading drop' : 'tags-heading'}
        title={t('tags.topLevel')}
        onDragOver={(e) => dragOver(e, TOP)}
        onDragLeave={() => setDropKey((k) => (k === TOP ? null : k))}
        onDrop={(e) => drop(e, null)}
        data-testid="tags-top"
      >
        <SectionHeading
          title={t('tags.heading')}
          icon={SECTION_ICONS.tags}
          route={{ name: 'tags' }}
          folded={folded}
          onFold={onFold}
          testId="section-tags"
          action={
            <button
              type="button"
              className="icon"
              aria-label={t('tags.new')}
              title={t('tags.new')}
              onClick={() => {
                // A folded section opens to show the new tag's name field.
                onFold(false);
                setCreating(true);
              }}
              data-testid="tag-new"
            >
              +
            </button>
          }
        />
      </div>
      {!folded && (
        <>
            {creating && (
              <div className="tag-row tag-new-row">
                <span className="tag-toggle" />
                <NameInput
                  label={t('tags.new')}
                  placeholder={t('tags.newPlaceholder')}
                  initial=""
                  testId="tag-name-input"
                  onDone={(name) => {
                    setCreating(false);
                    if (name) createTag(lib, { name }).catch(report);
                  }}
                />
              </div>
            )}
            {tree.length === 0 && !creating && <p className="section-empty">{t('tags.empty')}</p>}
            <ul className="tag-tree" role="tree" aria-label={t('tags.heading')} data-testid="tag-tree">
              {tree.map(renderNode)}
            </ul>
        </>
      )}
    </section>
  );
}

interface NameInputProps {
  label: string;
  placeholder?: string;
  initial: string;
  testId: string;
  /** The trimmed name, or null when cancelled (Escape) or left empty. */
  onDone(name: string | null): void;
}

/** An inline name field: Enter or leaving it finishes, Escape cancels. */
export function NameInput({ label, placeholder, initial, testId, onDone }: NameInputProps) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      className="tag-name-input"
      autoFocus
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (isImeKey(e.nativeEvent)) return;
        if (e.key === 'Enter') finish(value.trim() || null);
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(value.trim() || null)}
      data-testid={testId}
    />
  );
}
