import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { iconDownload, iconReplace, iconCopy } from '../icons';

@customElement('drop-menu')
export class DropMenu extends LitElement {
  @property({ type: Boolean }) visible = false;
  @property({ type: Number }) x = 0;
  @property({ type: Number }) y = 0;
  /** If true, asset already exists in target — show Replace instead of Copy */
  @property({ type: Boolean }) assetExists = false;
  /** If true, asset is symlinked or from canonical — show Install instead of Copy */
  @property({ type: Boolean }) isInstall = false;

  static styles = css`
    :host {
      display: block;
    }

    .menu {
      position: fixed;
      z-index: 200;
      background: var(--vscode-menu-background, #252526);
      border: 1px solid var(--vscode-menu-border, #454545);
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      padding: 4px 0;
      min-width: 140px;
      opacity: 0;
      pointer-events: none;
      transform: scale(0.95);
      transition: opacity 0.12s, transform 0.12s;
    }

    .menu.visible {
      opacity: 1;
      pointer-events: all;
      transform: scale(1);
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 12px;
      color: var(--vscode-menu-foreground, #ccc);
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-family: inherit;
    }

    .menu-item:hover {
      background: var(--vscode-menu-selectionBackground, #094771);
      color: var(--vscode-menu-selectionForeground, #fff);
    }

    .menu-item svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
  `;

  render() {
    return html`
      <div
        class="menu ${this.visible ? 'visible' : ''}"
        style="left: ${this.x}px; top: ${this.y}px;"
      >
        ${this.isInstall ? html`
          <button class="menu-item" @click="${this._copy}">
            ${iconDownload()}
            Install
          </button>
        ` : this.assetExists ? html`
          <button class="menu-item" @click="${this._replace}">
            ${iconReplace()}
            Replace
          </button>
        ` : html`
          <button class="menu-item" @click="${this._copy}">
            ${iconCopy()}
            Copy
          </button>
        `}
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

  private _copy() {
    this.dispatchEvent(new CustomEvent('drop-copy', { bubbles: true, composed: true }));
  }

  private _replace() {
    this.dispatchEvent(new CustomEvent('drop-replace', { bubbles: true, composed: true }));
  }

  private _dismiss() {
    this.dispatchEvent(new CustomEvent('drop-dismiss', { bubbles: true, composed: true }));
  }
}
