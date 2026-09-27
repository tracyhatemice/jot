// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { draftFromSource, UnsupportedFileError } from './draft';

describe('draftFromSource', () => {
  it('prefers pasted HTML and falls back to plain text', () => {
    expect(draftFromSource({ kind: 'paste', text: 'plain', html: '<h1>题</h1><p>文</p>' })).toMatchObject({
      title: '题',
      importKind: 'paste',
      blocks: [{ k: 'h1' }, { k: 'p' }],
    });
    expect(draftFromSource({ kind: 'paste', text: '甲\n\n乙', html: '<meta charset="utf-8">' })).toMatchObject({
      title: '',
      blocks: [{ k: 'p' }, { k: 'p' }],
    });
  });

  it('reads .md files with the first heading as title and .txt files with the file name', () => {
    expect(draftFromSource({ kind: 'file', name: 'guxiang.md', text: '# 故乡\n\n我冒了严寒。' })).toMatchObject({
      title: '故乡',
      importKind: 'md',
    });
    expect(draftFromSource({ kind: 'file', name: 'notes.MD', text: '没有标题' })).toMatchObject({ title: 'notes', importKind: 'md' });
    expect(draftFromSource({ kind: 'file', name: '春.txt', text: '\u{FEFF}第一段\n第二段' })).toMatchObject({
      title: '春',
      importKind: 'txt',
      blocks: [{ runs: [{ t: '第一段' }] }, { runs: [{ t: '第二段' }] }],
    });
  });

  it('rejects unsupported file types (Review Focus 5)', () => {
    expect(() => draftFromSource({ kind: 'file', name: 'essay.docx', text: '' })).toThrow(UnsupportedFileError);
  });
});
