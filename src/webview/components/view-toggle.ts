import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { ViewMode } from '../types';

@customElement('view-toggle')
export class ViewToggle extends LitElement {
  @property({ type: String }) view: ViewMode = 'repo';
  @property({ type: Number }) repoCount = 0;
  /** Unique asset count (grouped by type+name, not per-repo instances) */
  @property({ type: Number }) assetCount = 0;

  static styles = css`
    :host {
      display: inline-flex;
    }

    .toggle {
      display: inline-flex;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border, #ddd);
    }

    button {
      padding: 6px 14px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground, #333);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }

    button:hover {
      background: var(--vscode-list-hoverBackground, #e8e8e8);
    }

    button.active {
      background: var(--vscode-button-background, #007acc);
      color: var(--vscode-button-foreground, #fff);
    }
  `;

  render() {
    return html`
      <div class="toggle">
        <button
          class="${this.view === 'repo' ? 'active' : ''}"
          @click="${() => this._switch('repo')}"
        >Repositories${this.repoCount ? ` (${this.repoCount})` : ''}</button>
        <button
          class="${this.view === 'type' ? 'active' : ''}"
          @click="${() => this._switch('type')}"
        >Assets${this.assetCount ? ` (${this.assetCount})` : ''}</button>
      </div>
    `;
  }

  private _switch(view: ViewMode) {
    this.view = view;
    this.dispatchEvent(new CustomEvent('view-change', {
      detail: view,
      bubbles: true,
      composed: true,
    }));
  }
}
