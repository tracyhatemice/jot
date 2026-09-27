import type { Messages } from './en';

export const zhCN: Messages = {
  app: {
    loading: '正在打开文库…',
    locked: 'Jot 已在另一个标签页中打开。关闭那个标签页后即可在这里继续。',
    unavailable: '存储不可用：{{message}}',
    language: '语言',
    error: '出错了：',
    dismiss: '关闭',
  },
  library: {
    heading: '文库',
    empty: '还没有文章。导入一篇范文开始吧。',
    import: '导入',
    delete: '删除',
    confirmDelete: '删除《{{title}}》？其中的标注和旁注也会一并删除。',
    collapse: '收起文库',
    expand: '展开文库',
  },
  importDialog: {
    heading: '导入范文',
    title: '标题',
    titlePlaceholder: '留空则使用第一行',
    author: '作者',
    source: '出处',
    paste: '粘贴文章',
    pastePlaceholder: '在此粘贴文本…',
    file: '或打开 .txt / .md 文件',
    paragraphs: '段落：{{count}}',
    submit: '导入',
    cancel: '取消',
    empty: '没有可导入的文字。',
    unsupported: '目前只能导入 .txt 和 .md 文件。',
  },
  article: {
    none: '从文库中选择一篇文章，或导入一篇。',
    loading: '加载中…',
    missing: '这篇文章已不存在。',
  },
  toolbar: {
    underline: '划线',
    bold: '加粗',
    highlight: '高亮',
    note: '旁注',
  },
  markup: {
    remove: '移除标注',
    addNote: '添加旁注',
    styles: { underline: '划线', bold: '加粗', highlight: '高亮' },
  },
  notes: {
    placeholder: '写旁注…',
    delete: '删除旁注',
  },
  memo: {
    heading: '札记',
    comingSoon: '分析札记将在下一次更新中推出。',
  },
};
