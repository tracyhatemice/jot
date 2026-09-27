import { newId } from '@jot/core';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import type { PassageOption } from './passages';

export interface LinkSuggestionState {
  query: string;
  items: PassageOption[];
  /** Where the trigger was typed (viewport coordinates), for placing the list. */
  rect: DOMRect | null;
  choose(item: PassageOption): void;
}

export interface LinkSuggestionOptions {
  find(query: string): Promise<PassageOption[]>;
  /** The list to show, or null to hide it. */
  onChange(state: LinkSuggestionState | null): void;
  /** Arrow keys and Enter while the list is shown; true when handled. */
  onKeyDown(event: KeyboardEvent): boolean;
}

/** `[[`, and `【【`, which is what the `[` key types with a Chinese input method. */
export const LINK_TRIGGERS = ['[[', '【【'] as const;

const toState = (props: SuggestionProps<PassageOption, PassageOption>): LinkSuggestionState => ({
  query: props.query,
  items: props.items,
  rect: props.clientRect?.() ?? null,
  choose: (item) => props.command(item),
});

/** Typing a trigger and part of a passage offers matching markups and side notes; choosing one inserts a chip. */
export const LinkSuggestion = Extension.create<LinkSuggestionOptions>({
  name: 'linkSuggestion',

  addOptions() {
    return { find: async () => [], onChange: () => undefined, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const { find, onChange, onKeyDown } = this.options;
    return LINK_TRIGGERS.map((char, i) =>
      Suggestion<PassageOption, PassageOption>({
        editor: this.editor,
        pluginKey: new PluginKey(`linkSuggestion${i}`),
        char,
        // Chinese text has no space before the trigger.
        allowedPrefixes: null,
        items: ({ query }) => find(query),
        command: ({ editor, range, props }) => {
          const link = { targetType: props.targetType, targetId: props.targetId, articleId: props.articleId, label: props.label };
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: 'anchorLink', attrs: { ...link, linkId: newId() } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: () => ({
          onStart: (props) => onChange(toState(props)),
          onUpdate: (props) => onChange(toState(props)),
          onKeyDown: ({ event }) => {
            if (event.key === 'Escape') {
              onChange(null);
              return true;
            }
            return onKeyDown(event);
          },
          onExit: () => onChange(null),
        }),
      }),
    );
  },
});
