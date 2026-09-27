import { useTranslation } from 'react-i18next';
import type { ToolbarAction } from '../article/markupRange';

const DEFAULT_ACTIONS: readonly ToolbarAction[] = ['underline', 'bold', 'highlight', 'note', 'quote'];

interface Props {
  top: number;
  left: number;
  actions?: readonly ToolbarAction[];
  onAction(action: ToolbarAction): void;
}

export function SelectionToolbar({ top, left, actions = DEFAULT_ACTIONS, onAction }: Props) {
  const { t } = useTranslation();
  // preventDefault on mousedown keeps the text selection while a button is pressed.
  return (
    <div className="toolbar" role="toolbar" style={{ top, left }} onMouseDown={(e) => e.preventDefault()} data-testid="selection-toolbar">
      {actions.map((action) => (
        <button key={action} type="button" onClick={() => onAction(action)} data-testid={`toolbar-${action}`}>
          {t(`toolbar.${action}`)}
        </button>
      ))}
    </div>
  );
}
