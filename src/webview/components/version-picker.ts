import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { VersionOption } from '../types';

@customElement('version-picker')
export class VersionPicker extends LitElement {
  @property({ type: Boolean }) visible = false;
  @property({ type: Array }) versions: VersionOption[] = [];
  @property({ type: String }) assetName = '';
  @property({ type: String }) assetPath = '';
  @property({ type: String }) assetRepoName = '';

  @state() private _selected = '';

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
      width: min(520px, 90vw);
      max-height: 70vh;
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

    .body {
      flex: 1; overflow-y: auto; padding: 12px 20px 20px;
    }

    .version-row {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 14px; border-radius: 6px;
      border: 1px solid var(--vscode-panel-border, #454545);
      cursor: pointer; margin-bottom: 8px;
      transition: border-color 0.12s, background 0.12s;
    }
    .version-row:hover { border-color: var(--vscode-focusBorder, #007acc); }
    .version-row.selected {
      border-color: var(--vscode-focusBorder, #007acc);
      background: rgba(0,122,204,0.08);
    }

    .radio {
      width: 16px; height: 16px; border-radius: 50%;
      border: 2px solid var(--vscode-panel-border, #666);
      flex-shrink: 0; margin-top: 1px;
      display: flex; align-items: center; justify-content: center;
    }
    .version-row.selected .radio {
      border-color: var(--vscode-button-background, #007acc);
    }
    .radio-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--vscode-button-background, #007acc);
      display: none;
    }
    .version-row.selected .radio-dot { display: block; }

    .version-info { flex: 1; min-width: 0; }
    .version-repo { font-size: 12px; font-weight: 600; }
    .version-hash {
      font-size: 10px; opacity: 0.5;
      font-family: var(--vscode-editor-font-family, monospace);
      margin-top: 2px;
    }
    .version-preview {
      font-size: 10px; opacity: 0.4; margin-top: 4px;
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
  `;

  updated(changed: Map<string, unknown>) {
    if (changed.has('visible') && this.visible && this.versions.length > 0) {
      this._selected = this.versions[0].path;
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
    return html`
      <div class="backdrop ${this.visible ? 'open' : ''}" @click="${this._dismiss}"></div>
      <div class="modal ${this.visible ? 'open' : ''}">
        <div class="header">
          <div>
            <div class="header-title">Choose canonical version</div>
            <div class="header-sub">"${this.assetName}" has ${this.versions.length} different versions</div>
          </div>
          <button class="close-btn" @click="${this._dismiss}">✕</button>
        </div>
        <div class="body">
          ${this.versions.map(v => html`
            <div class="version-row ${this._selected === v.path ? 'selected' : ''}"
                 @click="${() => { this._selected = v.path; }}">
              <div class="radio"><div class="radio-dot"></div></div>
              <div class="version-info">
                <div class="version-repo">${v.repoName}</div>
                <div class="version-hash">${v.hash.slice(0, 8)}</div>
                ${v.preview ? html`<div class="version-preview">${v.preview.slice(0, 200)}</div>` : ''}
              </div>
            </div>
          `)}
        </div>
        <div class="footer">
          <button class="btn btn-secondary" @click="${this._dismiss}">Cancel</button>
          <button class="btn btn-primary" ?disabled="${!this._selected}" @click="${this._confirm}">
            Use this version
          </button>
        </div>
      </div>
    `;
  }

  private _confirm() {
    this.dispatchEvent(new CustomEvent('version-picker-confirm', {
      detail: { selectedPath: this._selected },
      bubbles: true, composed: true,
    }));
  }

  private _dismiss() {
    this.dispatchEvent(new CustomEvent('version-picker-dismiss', {
      bubbles: true, composed: true,
    }));
  }
}
