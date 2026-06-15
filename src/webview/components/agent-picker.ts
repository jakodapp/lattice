import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { SerializedAsset } from '../types';
import type { ExportTarget } from '../../services/agent-export-matrix';

@customElement('agent-picker')
export class AgentPicker extends LitElement {
  @property({ type: Boolean }) visible = false;
  @property({ type: Object }) asset: SerializedAsset | null = null;
  @property({ type: Array }) targets: ExportTarget[] = [];
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

    .agent-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
    }

    .agent-card {
      border: 1px solid var(--vscode-panel-border, #454545);
      border-radius: 8px;
      padding: 12px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      position: relative;
    }

    .agent-card:hover {
      border-color: var(--vscode-focusBorder, #007acc);
    }

    .agent-card.selected {
      border-color: var(--vscode-button-background, #007acc);
      background: rgba(0, 122, 204, 0.08);
    }

    .agent-card.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .agent-checkbox {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 16px;
      height: 16px;
      accent-color: var(--vscode-button-background, #007acc);
    }

    .agent-name {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 4px;
      padding-right: 20px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .method-badge {
      font-size: 8px;
      padding: 1px 5px;
      border-radius: 2px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      font-weight: 700;
    }

    .method-badge.symlink {
      background: rgba(0,128,255,0.18);
      color: #4fa3ff;
    }

    .method-badge.convert {
      background: rgba(234,179,8,0.18);
      color: #EAB308;
    }

    .agent-installed {
      font-size: 10px;
      color: var(--vscode-charts-green, #4ade80);
      margin-top: 4px;
    }

    .agent-reason {
      font-size: 10px;
      color: var(--vscode-descriptionForeground, #888);
      margin-top: 4px;
      line-height: 1.3;
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

    .hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888);
      margin-bottom: 12px;
      line-height: 1.4;
    }
  `;

  updated(changed: Map<string, unknown>) {
    if (changed.has('visible') && this.visible) {
      this._selected = new Set();
    }
  }

  render() {
    if (!this.visible || !this.asset) return html``;
    const count = this._selected.size;
    return html`
      <div class="backdrop visible" @click="${this._dismiss}">
        <div class="modal" @click="${(e: Event) => e.stopPropagation()}">
          <div class="modal-header">
            <span class="modal-title">Export "${this.asset.name}" to agents</span>
            <button class="close-btn" @click="${this._dismiss}">✕</button>
          </div>
          <div class="modal-body">
            <div class="hint">
              SYMLINK shares one source of truth; CONVERT writes a translated copy in the target agent's format (re-export to sync it).
            </div>
            <div class="agent-grid">
              ${this.targets.map(t => this._renderCard(t))}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="${this._dismiss}">Cancel</button>
            <button class="btn btn-primary" ?disabled="${count === 0}" @click="${this._confirm}">
              Export to ${count} agent${count !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderCard(target: ExportTarget) {
    const selectable = target.compatible && !target.alreadyInstalled;
    const selected = this._selected.has(target.agentId);
    return html`
      <div
        class="agent-card ${selected ? 'selected' : ''} ${selectable ? '' : 'disabled'}"
        @click="${() => selectable && this._toggle(target.agentId)}"
      >
        <input type="checkbox" class="agent-checkbox" .checked="${selected || target.alreadyInstalled}" ?disabled="${!selectable}" tabindex="-1" />
        <div class="agent-name" title="${target.displayName}">${target.displayName}</div>
        ${target.method ? html`<span class="method-badge ${target.method}">${target.method}</span>` : ''}
        ${target.alreadyInstalled
          ? html`<div class="agent-installed">✓ already configured</div>`
          : !target.compatible
            ? html`<div class="agent-reason">${target.reason}</div>`
            : ''}
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

  private _toggle(agentId: string) {
    const next = new Set(this._selected);
    if (next.has(agentId)) {
      next.delete(agentId);
    } else {
      next.add(agentId);
    }
    this._selected = next;
  }

  private _confirm() {
    if (this._selected.size === 0 || !this.asset) return;
    this.dispatchEvent(new CustomEvent('agent-picker-confirm', {
      detail: { asset: this.asset, targetAgentIds: Array.from(this._selected) },
      bubbles: true,
      composed: true,
    }));
  }

  private _dismiss() {
    this.dispatchEvent(new CustomEvent('agent-picker-dismiss', { bubbles: true, composed: true }));
  }
}
