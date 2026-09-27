import { useTranslation } from 'react-i18next';
import type { ToolbarAction } from '../article/markupRange';

const ACTIONS: ToolbarAction[] = ['term', 'line', 'paragraph', 'note'];

export function SelectionToolbar({ top, left, onAction }: { top: number; left: number; onAction(action: ToolbarAction): void }) {
  const { t } = useTranslation();
  // preventDefault on mousedown keeps the text selection while a button is pressed.
  return (
    <div className="toolbar" role="toolbar" style={{ top, left }} onMouseDown={(e) => e.preventDefault()} data-testid="selection-toolbar">
      {ACTIONS.map((action) => (
        <button key={action} type="button" onClick={() => onAction(action)} data-testid={`toolbar-${action}`}>
          {t(`toolbar.${action}`)}
        </button>
      ))}
    </div>
  );
}
