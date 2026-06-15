import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SerializedAsset, GLOBAL_MERGED_NAME, DEFAULT_TOOL, isAssetActiveForAgent } from '../types';
import { iconChevron } from '../icons';
import './asset-chip';

@customElement('kanban-column')
export class KanbanColumn extends LitElement {
  @property({ type: String }) columnTitle = '';
  @property({ type: Array }) assets: SerializedAsset[] = [];
  @property({ type: String }) repoName = '';
  @property({ type: Boolean }) selected = false;
  @property({ type: Boolean }) isGlobal = false;
  @property({ type: Boolean }) isCanonical = false;
  @property({ type: Object }) divergedPaths: Set<string> = new Set();
  @property({ type: Object }) updatePaths: Set<string> = new Set();
  @property({ type: String }) selectedAgent = DEFAULT_TOOL;
  @state() private _dragOver = false;

  static styles = css`
    :host {
      display: block;
    }

    .column {
      display: flex;
      flex-direction: column;
      background: var(--vscode-sideBar-background, #f8f8f8);
      border-radius: 8px;
      border: 1px solid var(--vscode-panel-border, #e0e0e0);
      transition: border-color 0.2s, box-shadow 0.2s;
      overflow: hidden;
    }

    .column.selected {
      border-color: var(--vscode-focusBorder, #007acc);
      box-shadow: 0 0 8px var(--vscode-focusBorder, rgba(0,122,204,0.4));
    }

    .column.drag-over {
      border-color: var(--vscode-focusBorder, #007acc);
      box-shadow: 0 0 0 2px var(--vscode-focusBorder, #007acc33);
    }

    .header {
      padding: 10px 12px;
      background: var(--vscode-sideBarSectionHeader-background, #eaeaea);
      border-bottom: 1px solid var(--vscode-panel-border, #e0e0e0);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
    }

    .header:hover {
      background: var(--vscode-list-hoverBackground, #e0e0e0);
    }

    .header-title {
      font-weight: 600;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-chevron {
      width: 12px;
      height: 12px;
      opacity: 0;
      flex-shrink: 0;
      transition: opacity 0.15s;
    }

    .header:hover .header-chevron {
      opacity: 0.5;
    }

    .body {
      padding: 6px;
    }

    .drop-zone {
      border: 2px dashed transparent;
      border-radius: 6px;
      padding: 2px;
      min-height: 20px;
      transition: border-color 0.2s;
    }

    .drop-zone.active {
      border-color: var(--vscode-focusBorder, #007acc);
      background: rgba(0, 122, 204, 0.05);
    }

    .empty-hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888);
      text-align: center;
      padding: 12px 8px;
      opacity: 0.7;
    }
    .global-badge {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.6;
      margin-left: 6px;
    }
  `;

  render() {
    return html`
      <div class="column ${this._dragOver ? 'drag-over' : ''} ${this.selected ? 'selected' : ''} ${this.isGlobal ? 'global' : ''}" @contextmenu="${this._onHeaderContextMenu}">
        <div class="header" @click="${this._onHeaderClick}">
          <span class="header-title" title="${this.columnTitle}">${this.columnTitle}${this.isGlobal && this.columnTitle !== GLOBAL_MERGED_NAME ? html`<span class="global-badge">GLOBAL</span>` : ''}${this.isCanonical ? html`<span class="global-badge">CANONICAL</span>` : ''}</span>
          ${iconChevron('header-chevron')}
        </div>
        <div
          class="body"
          @dragover="${this._onDragOver}"
          @dragleave="${this._onDragLeave}"
          @drop="${this._onDrop}"
        >
          <div class="drop-zone ${this._dragOver ? 'active' : ''}">
            ${this.assets.length === 0
              ? html`<div class="empty-hint">No assets yet</div>`
              : this.assets.map(asset => html`
                <asset-chip .asset="${asset}" .diverged="${this.divergedPaths.has(asset.path)}" .hasUpdate="${this.updatePaths.has(asset.path)}" .tools="${asset.mergedTools ?? []}" .copies="${asset.mergedCount ?? 1}" .disabled="${!this.isCanonical && !isAssetActiveForAgent(asset, this.selectedAgent)}"></asset-chip>
              `)}
          </div>
        </div>
      </div>
    `;
  }

  private _onHeaderClick() {
    this.dispatchEvent(new CustomEvent('column-header-click', {
      detail: { repoName: this.repoName, title: this.columnTitle },
      bubbles: true,
      composed: true,
    }));
  }

  private _onHeaderContextMenu(e: MouseEvent) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('column-context-menu', {
      detail: { repoName: this.repoName, x: e.clientX, y: e.clientY },
      bubbles: true,
      composed: true,
    }));
  }

  /** The merged GLOBAL column has no single target dir — cross-tool installs go through Export */
  private get _dropDisabled(): boolean {
    return this.repoName === GLOBAL_MERGED_NAME;
  }

  private _onDragOver(e: DragEvent) {
    if (this._dropDisabled) { return; }
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    this._dragOver = true;
  }

  private _onDragLeave() {
    this._dragOver = false;
  }

  private _onDrop(e: DragEvent) {
    if (this._dropDisabled) { return; }
    e.preventDefault();
    this._dragOver = false;

    const data = e.dataTransfer?.getData('application/json');
    if (!data) {return;}

    try {
      const asset: SerializedAsset = JSON.parse(data);
      if (asset.repoName === this.repoName) {return;}

      // Emit with mouse coordinates for the floating menu
      this.dispatchEvent(new CustomEvent('asset-drop-at', {
        detail: { asset, targetRepoName: this.repoName, x: e.clientX, y: e.clientY },
        bubbles: true,
        composed: true,
      }));
    } catch {
      // Invalid data
    }
  }
}
