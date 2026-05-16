import { css } from 'lit';

export const globalStyles = css`
  :host {
    --bg-column: var(--vscode-sideBar-background, #f3f3f3);
    --bg-column-header: var(--vscode-sideBarSectionHeader-background, #e8e8e8);
    --text-primary: var(--vscode-foreground, #333);
    --text-secondary: var(--vscode-descriptionForeground, #666);
    --border-color: var(--vscode-panel-border, #ddd);
    --drop-highlight: var(--vscode-focusBorder, #007acc);
    --radius: 6px;
    --radius-sm: 4px;

    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--text-primary);
  }
`;
