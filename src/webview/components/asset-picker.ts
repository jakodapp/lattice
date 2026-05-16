import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { DiscoveredAssetSerialized, ASSET_TYPE_LABELS } from '../types';

@customElement('asset-picker')
export class AssetPicker extends LitElement {
  @property({ type: Boolean }) visible = false;
  @property({ type: Array }) assets: DiscoveredAssetSerialized[] = [];
  @property({ type: String }) repoName = '';

  @state() private _selected = new Set<string>();

  static styles = css`
    :host { display: block; }

    .backdrop {
      position: fixed; inset: 0; z-index: 300;
      background: rgba(0,0,0,0.5);
      opacity: 0; pointer-events: none;
      transition: opacity 0.15s;
    }
    .backdrop.open { opacity: 1; pointer-events: all; }

    .modal {
      position: fixed; z-index: 301;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) scale(0.95);
      width: min(640px, 90vw);
      max-height: 80vh;
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #454545);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      display: flex; flex-direction: column;
      opacity: 0; pointer-events: none;
      transition: opacity 0.15s, transform 0.15s;
    }
    .modal.open {
      opacity: 1; pointer-events: all;
      transform: translate(-50%, -50%) scale(1);
    }

    .header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--vscode-panel-border, #454545);
      display: flex; align-items: center; justify-content: space-between;
    }
    .header-title { font-size: 14px; font-weight: 600; }
    .header-sub { font-size: 11px; opacity: 0.6; margin-top: 2px; }
    .close-btn {
      background: none; border: none; cursor: pointer;
      font-size: 18px; padding: 4px 8px; border-radius: 4px;
      color: var(--vscode-foreground, #ccc);
    }
    .close-btn:hover { background: rgba(255,255,255,0.1); }

    .toolbar {
      padding: 10px 20px;
      border-bottom: 1px solid var(--vscode-panel-border, #454545);
      display: flex; align-items: center; justify-content: space-between;
    }
    .select-all {
      font-size: 12px; cursor: pointer;
      color: var(--vscode-textLink-foreground, #3794ff);
      background: none; border: none; padding: 4px 8px; border-radius: 4px;
    }
    .select-all:hover { background: rgba(255,255,255,0.08); }
    .count { font-size: 11px; opacity: 0.6; }

    .body {
      flex: 1; overflow-y: auto; padding: 12px 20px 20px;
    }

    .type-group { margin-bottom: 16px; }
    .type-label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.8px; opacity: 0.45; margin-bottom: 6px; padding: 0 4px;
    }

    .asset-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
    }

    .asset-card {
      border: 1px solid var(--vscode-panel-border, #454545);
      border-radius: 6px; padding: 10px 12px;
      cursor: pointer; transition: border-color 0.12s, background 0.12s;
      position: relative;
    }
    .asset-card:hover { border-color: var(--vscode-focusBorder, #007acc); }
    .asset-card.selected {
      border-color: var(--vscode-focusBorder, #007acc);
      background: rgba(0,122,204,0.08);
    }

    .asset-card .checkbox {
      position: absolute; top: 8px; right: 8px;
      width: 16px; height: 16px; border-radius: 3px;
      border: 1px solid var(--vscode-panel-border, #666);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: var(--vscode-button-foreground, #fff);
      background: transparent; transition: background 0.12s;
    }
    .asset-card.selected .checkbox {
      background: var(--vscode-button-background, #007acc);
      border-color: var(--vscode-button-background, #007acc);
    }

    .asset-name {
      font-size: 12px; font-weight: 600;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      padding-right: 24px;
    }
    .asset-preview {
      font-size: 10px; opacity: 0.5; margin-top: 4px;
      display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden;
      line-height: 1.4;
    }

    .footer {
      padding: 12px 20px;
      border-top: 1px solid var(--vscode-panel-border, #454545);
      display: flex; justify-content: flex-end; gap: 8px;
    }
    .btn {
      padding: 6px 16px; border-radius: 4px; font-size: 12px;
      border: none; cursor: pointer;
    }
    .btn-primary {
      background: var(--vscode-button-background, #007acc);
      color: var(--vscode-button-foreground, #fff);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground, #005fa3); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }

    .empty {
      text-align: center; padding: 32px 0;
      font-size: 12px; opacity: 0.5;
    }
  `;

  updated(changed: Map<string, unknown>) {
    if (changed.has('visible') && this.visible) {
      this._selected = new Set(this.assets.map(a => a.sourcePath));
    }
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeyDown);
  }

  private _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.visible) this._dismiss();
  };

  render() {
    const grouped = this._groupByType();
    const allSelected = this._selected.size === this.assets.length;

    return html`
      <div class="backdrop ${this.visible ? 'open' : ''}" @click="${this._dismiss}"></div>
      <div class="modal ${this.visible ? 'open' : ''}">
        <div class="header">
          <div>
            <div class="header-title">Import from ${this.repoName}</div>
            <div class="header-sub">${this.assets.length} assets discovered</div>
          </div>
          <button class="close-btn" @click="${this._dismiss}">✕</button>
        </div>
        ${this.assets.length > 0 ? html`
          <div class="toolbar">
            <button class="select-all" @click="${this._toggleAll}">
              ${allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <span class="count">${this._selected.size} selected</span>
          </div>
        ` : ''}
        <div class="body">
          ${this.assets.length === 0
            ? html`<div class="empty">No .claude/ assets found in this repository</div>`
            : grouped.map(([label, assets]) => html`
              <div class="type-group">
                <div class="type-label">${label} (${assets.length})</div>
                <div class="asset-grid">
                  ${assets.map(a => html`
                    <div class="asset-card ${this._selected.has(a.sourcePath) ? 'selected' : ''}"
                         @click="${() => this._toggle(a.sourcePath)}">
                      <div class="checkbox">${this._selected.has(a.sourcePath) ? '✓' : ''}</div>
                      <div class="asset-name">${a.name}</div>
                      ${a.preview ? html`<div class="asset-preview">${a.preview.slice(0, 120)}</div>` : ''}
                    </div>
                  `)}
                </div>
              </div>
            `)
          }
        </div>
        <div class="footer">
          <button class="btn btn-secondary" @click="${this._dismiss}">Cancel</button>
          <button class="btn btn-primary" ?disabled="${this._selected.size === 0}" @click="${this._confirm}">
            Install ${this._selected.size} asset${this._selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    `;
  }

  private _groupByType(): [string, DiscoveredAssetSerialized[]][] {
    const groups = new Map<string, DiscoveredAssetSerialized[]>();
    for (const asset of this.assets) {
      const label = ASSET_TYPE_LABELS[asset.type] ?? asset.type;
      const list = groups.get(label) ?? [];
      list.push(asset);
      groups.set(label, list);
    }
    return [...groups.entries()];
  }

  private _toggle(path: string) {
    const next = new Set(this._selected);
    if (next.has(path)) { next.delete(path); } else { next.add(path); }
    this._selected = next;
  }

  private _toggleAll() {
    if (this._selected.size === this.assets.length) {
      this._selected = new Set();
    } else {
      this._selected = new Set(this.assets.map(a => a.sourcePath));
    }
  }

  private _confirm() {
    this.dispatchEvent(new CustomEvent('asset-picker-confirm', {
      detail: { selectedPaths: [...this._selected] },
      bubbles: true, composed: true,
    }));
  }

  private _dismiss() {
    this.dispatchEvent(new CustomEvent('asset-picker-dismiss', {
      bubbles: true, composed: true,
    }));
  }
}
