import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('search-bar')
export class SearchBar extends LitElement {
  @property({ type: String }) value = '';

  static styles = css`
    :host {
      display: inline-flex;
      flex: 1;
      max-width: 300px;
    }

    .search {
      display: flex;
      align-items: center;
      width: 100%;
      border: 1px solid var(--vscode-input-border, #ddd);
      border-radius: 6px;
      background: var(--vscode-input-background, #fff);
      padding: 0 10px;
      gap: 6px;
    }

    .search:focus-within {
      border-color: var(--vscode-focusBorder, #007acc);
    }

    .icon {
      font-size: 13px;
      opacity: 0.5;
    }

    input {
      flex: 1;
      border: none;
      background: transparent;
      padding: 6px 0;
      font-size: 12px;
      color: var(--vscode-input-foreground, #333);
      outline: none;
      font-family: inherit;
    }

    input::placeholder {
      color: var(--vscode-input-placeholderForeground, #999);
    }

    .clear {
      cursor: pointer;
      opacity: 0.4;
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 3px;
      border: none;
      background: none;
      color: var(--vscode-foreground, #333);
    }

    .clear:hover {
      opacity: 1;
      background: rgba(0,0,0,0.08);
    }
  `;

  render() {
    return html`
      <div class="search">
        <span class="icon">🔍</span>
        <input
          type="text"
          placeholder="Filter assets..."
          .value="${this.value}"
          @input="${this._onInput}"
        />
        ${this.value ? html`
          <button class="clear" @click="${this._onClear}">✕</button>
        ` : ''}
      </div>
    `;
  }

  private _onInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.value = value;
    this.dispatchEvent(new CustomEvent('search-change', {
      detail: value,
      bubbles: true,
      composed: true,
    }));
  }

  private _onClear() {
    this.value = '';
    this.dispatchEvent(new CustomEvent('search-change', {
      detail: '',
      bubbles: true,
      composed: true,
    }));
  }
}
