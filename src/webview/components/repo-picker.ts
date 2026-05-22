import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { SerializedAsset, SerializedRepo } from '../types';

@customElement('repo-picker')
export class RepoPicker extends LitElement {
  @property({ type: Boolean }) visible = false;
  @property({ type: String }) action: 'copy' | 'move' | 'install' = 'copy';
  @property({ type: Object }) asset: SerializedAsset | null = null;
  @property({ type: Array }) repos: SerializedRepo[] = [];
  @property({ type: Boolean }) includeCanonical = false;
  @state() private _selected = new Set<string>();

  static styles = css`
    :host { display: block; }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 300;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s;
    }

    .backdrop.visible {
      opacity: 1;
      pointer-events: all;
    }

    .modal {
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #454545);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      width: min(600px, 90vw);
      max-height: 70vh;
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform 0.15s;
    }

    .backdrop.visible .modal {
      transform: scale(1);
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--vscode-panel-border, #454545);
    }

    .modal-title {
      font-size: 14px;
      font-weight: 600;
    }

    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
      color: var(--vscode-foreground, #ccc);
      padding: 4px 8px;
      border-radius: 4px;
    }

    .close-btn:hover {
      background: rgba(255,255,255,0.1);
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }

    .repo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
    }

    .repo-card {
      border: 1px solid var(--vscode-panel-border, #454545);
      border-radius: 8px;
      padding: 12px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      position: relative;
    }

    .repo-card:hover {
      border-color: var(--vscode-focusBorder, #007acc);
    }

    .repo-card.selected {
      border-color: var(--vscode-button-background, #007acc);
      background: rgba(0, 122, 204, 0.08);
    }

    .repo-card.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .repo-checkbox {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 16px;
      height: 16px;
      accent-color: var(--vscode-button-background, #007acc);
    }

    .repo-name {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 4px;
      padding-right: 20px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .repo-agents {
      display: flex;
      gap: 3px;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }

    .agent-pill {
      font-size: 8px;
      padding: 1px 4px;
      border-radius: 2px;
      background: rgba(255,255,255,0.08);
      color: var(--vscode-descriptionForeground, #888);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .repo-meta {
      font-size: 10px;
      color: var(--vscode-descriptionForeground, #888);
    }

    .repo-exists {
      font-size: 10px;
      color: var(--vscode-charts-green, #4ade80);
      margin-top: 4px;
    }

    .modal-footer {
      padding: 12px 20px;
      border-top: 1px solid var(--vscode-panel-border, #454545);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .btn {
      padding: 7px 16px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
    }

    .btn-primary {
      background: var(--vscode-button-background, #007acc);
      color: var(--vscode-button-foreground, #fff);
    }

    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground, #005fa3);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: transparent;
      color: var(--vscode-foreground, #ccc);
      border: 1px solid var(--vscode-panel-border, #454545);
    }

    .btn-secondary:hover {
      background: rgba(255,255,255,0.05);
    }

    .add-repo-link {
      font-size: 12px;
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      text-decoration: none;
    }

    .add-repo-link:hover {
      text-decoration: underline;
    }

    .empty-state {
      text-align: center;
      padding: 24px;
      color: var(--vscode-descriptionForeground, #888);
      font-size: 12px;
    }
  `;

  private _knownRepoNames = new Set<string>();

  updated(changed: Map<string, unknown>) {
    if (changed.has('visible') && this.visible) {
      this._selected = new Set();
      this._knownRepoNames = new Set(this.repos.map(r => r.name));
    }
    // Auto-select newly added repos while picker is open
    if (changed.has('repos') && this.visible) {
      const currentNames = new Set(this.repos.map(r => r.name));
      for (const name of currentNames) {
        if (!this._knownRepoNames.has(name)) {
          this._selected = new Set([...this._selected, name]);
        }
      }
      this._knownRepoNames = currentNames;
    }
  }

  render() {
    if (!this.visible || !this.asset) return html``;

    const actionLabel = this.action === 'copy' ? 'Copy' : this.action === 'move' ? 'Move' : 'Install';
    const isSingleSelect = this.action === 'move';

    // Include canonical repos when explicitly enabled (e.g. GitHub import flow)
    const pickable = this.includeCanonical
      ? this.repos
      : this.repos.filter(r => !r.isCanonical);

    const count = this._selected.size;
    const confirmLabel = isSingleSelect
      ? `${actionLabel} to repo`
      : `${actionLabel} to ${count} repo${count !== 1 ? 's' : ''}`;

    return html`
      <div class="backdrop visible" @click="${this._onBackdropClick}">
        <div class="modal" @click="${(e: Event) => e.stopPropagation()}">
          <div class="modal-header">
            <span class="modal-title">${actionLabel} "${this.asset.name}"</span>
            <button class="close-btn" @click="${this._dismiss}">✕</button>
          </div>
          <div class="modal-body">
            ${pickable.length === 0
              ? html`<div class="empty-state">No other repositories available</div>`
              : html`
                <div class="repo-grid">
                  ${pickable.map(repo => {
                    const isSource = repo.name === this.asset!.repoName;
                    const selected = this._selected.has(repo.name);
                    const exists = repo.assets.some(a => a.name === this.asset!.name && a.type === this.asset!.type);
                    const isDisabled = isSource || exists;
                    const assetCount = repo.assets.length;
                    return html`
                      <div class="repo-card ${selected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}" @click="${() => !isDisabled && this._toggle(repo.name, isSingleSelect)}">
                        ${!isDisabled ? html`<input type="checkbox" class="repo-checkbox" .checked="${selected}" tabindex="-1" />` : ''}
                        <div class="repo-name" title="${repo.name}">${repo.name}</div>
                        ${repo.isCanonical ? html`
                          <div class="repo-agents"><span class="agent-pill" style="background:rgba(0,128,255,0.18);color:#4fa3ff;">CANONICAL</span></div>
                        ` : repo.agents && repo.agents.length > 0 ? html`
                          <div class="repo-agents">
                            ${repo.agents.map(a => html`<span class="agent-pill">${a}</span>`)}
                          </div>
                        ` : ''}
                        ${exists
                          ? html`<div class="repo-exists">✓ already exists</div>`
                          : html`<div class="repo-meta">${assetCount} asset${assetCount !== 1 ? 's' : ''}</div>`}
                      </div>
                    `;
                  })}
                </div>
              `}
          </div>
          <div class="modal-footer">
            <a class="add-repo-link" @click="${this._addRepo}">Can't find your repository?</a>
            <span style="flex:1"></span>
            <button class="btn btn-secondary" @click="${this._dismiss}">Cancel</button>
            <button class="btn btn-primary" ?disabled="${count === 0}" @click="${this._confirm}">${confirmLabel}</button>
          </div>
        </div>
      </div>
    `;
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
    if (e.key === 'Escape' && this.visible) {
      this._dismiss();
    }
  };

  private _addRepo() {
    this.dispatchEvent(new CustomEvent('picker-add-repo', { bubbles: true, composed: true }));
  }

  private _toggle(repoName: string, singleSelect: boolean) {
    const next = new Set(singleSelect ? [] : this._selected);
    if (next.has(repoName)) {
      next.delete(repoName);
    } else {
      next.add(repoName);
    }
    this._selected = next;
  }

  private _confirm() {
    if (this._selected.size === 0 || !this.asset) return;
    this.dispatchEvent(new CustomEvent('picker-confirm', {
      detail: {
        action: this.action,
        asset: this.asset,
        targetRepoNames: Array.from(this._selected),
      },
      bubbles: true,
      composed: true,
    }));
  }

  private _dismiss() {
    this.dispatchEvent(new CustomEvent('picker-dismiss', { bubbles: true, composed: true }));
  }

  private _onBackdropClick() {
    this._dismiss();
  }
}
