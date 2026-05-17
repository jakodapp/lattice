import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { isContextFile } from '../types';
import type { SerializedAsset } from '../types';
import { iconDownload, iconCopy, iconDiff, iconConvertLink, iconTrash } from '../icons';

@customElement('context-menu')
export class ContextMenu extends LitElement {
  @property({ type: Boolean }) visible = false;
  @property({ type: Number }) x = 0;
  @property({ type: Number }) y = 0;
  @property({ type: Object }) asset: SerializedAsset | null = null;
  /** How many non-canonical repos have this asset */
  @property({ type: Number }) instanceCount = 1;
  /** Which view opened this menu */
  @property({ type: String }) viewContext: 'repo' | 'type' = 'repo';

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
      min-width: 180px;
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

    .menu-item.danger:hover {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }

    .menu-item svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .separator {
      height: 1px;
      background: var(--vscode-menu-separatorBackground, #454545);
      margin: 3px 8px;
    }

    .overlay {
      position: fixed;
      inset: 0;
      z-index: 199;
    }
  `;

  render() {
    if (!this.visible || !this.asset) return html``;

    // Clamp position so menu doesn't go off-screen
    const menuWidth = 180;
    const menuHeight = 120;
    const clampedX = Math.min(this.x, window.innerWidth - menuWidth - 8);
    const clampedY = Math.min(this.y, window.innerHeight - menuHeight - 8);

    const isSymlink = this.asset.isSymlink;
    const isCanonical = this.asset.isCanonical;
    const isAssetsView = this.viewContext === 'type';
    const isRepoView = !isAssetsView;

    const contextFile = isContextFile(this.asset);
    const useInstall = isSymlink || isCanonical;
    const topLabel = useInstall ? 'Install to repo...' : 'Copy to repo...';
    const topHandler = useInstall ? this._installToRepo : this._copyToRepo;

    // Context files (CLAUDE.md) are unique per repo — always "Delete permanently"
    const deleteLabel = contextFile ? 'Delete permanently'
      : (isRepoView && (isSymlink || this.instanceCount > 1)) ? 'Remove from repo'
      : 'Delete completely';
    const deleteHandler = isCanonical ? this._deleteCanonical : this._delete;

    return html`
      <div class="overlay" @click="${this._dismiss}" @contextmenu="${this._dismissCtx}"></div>
      <div class="menu visible" style="left:${clampedX}px;top:${clampedY}px">
        ${!contextFile ? html`
          <button class="menu-item" @click="${topHandler}">
            ${useInstall ? iconDownload() : iconCopy()}
            ${topLabel}
          </button>
          <div class="separator"></div>
        ` : ''}
        ${!contextFile && this.instanceCount >= 2 ? html`
          <button class="menu-item" @click="${this._diffWith}">
            ${iconDiff()}
            Compare versions...
          </button>
        ` : ''}
        ${!contextFile && !this.asset.isSymlink && !isCanonical ? html`
          <button class="menu-item" @click="${this._convertToSymlink}">
            ${iconConvertLink()}
            Convert to symlink
          </button>
        ` : ''}
        ${!contextFile || this.instanceCount >= 2 || (!this.asset.isSymlink && !isCanonical) ? html`
          <div class="separator"></div>
        ` : ''}
        <button class="menu-item danger" @click="${deleteHandler}">
          ${iconTrash()}
          ${deleteLabel}
        </button>
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

  private _copyToRepo() {
    this.dispatchEvent(new CustomEvent('ctx-copy', { detail: this.asset, bubbles: true, composed: true }));
    this._dismiss();
  }

  private _delete() {
    this.dispatchEvent(new CustomEvent('ctx-delete', { detail: this.asset, bubbles: true, composed: true }));
    this._dismiss();
  }

  private _installToRepo() {
    this.dispatchEvent(new CustomEvent('ctx-install', { detail: this.asset, bubbles: true, composed: true }));
    this._dismiss();
  }

  private _diffWith() {
    this.dispatchEvent(new CustomEvent('ctx-diff', { detail: this.asset, bubbles: true, composed: true }));
    this._dismiss();
  }

  private _convertToSymlink() {
    this.dispatchEvent(new CustomEvent('ctx-convert-symlink', { detail: this.asset, bubbles: true, composed: true }));
    this._dismiss();
  }

  private _deleteCanonical() {
    this.dispatchEvent(new CustomEvent('ctx-delete-canonical', { detail: this.asset, bubbles: true, composed: true }));
    this._dismiss();
  }

  private _dismiss() {
    this.dispatchEvent(new CustomEvent('ctx-dismiss', { bubbles: true, composed: true }));
  }

  private _dismissCtx(e: MouseEvent) {
    e.preventDefault();
    this._dismiss();
  }
}
