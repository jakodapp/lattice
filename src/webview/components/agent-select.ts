import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SELECTABLE_AGENTS, DEFAULT_TOOL, getAgent } from '../../services/agent-defs';
import { iconSelector, iconAgent } from '../icons';

/**
 * Working-agent dropdown in the dashboard toolbar. The selected agent scopes
 * every write flow (add repo, copy, install) to its config dir.
 */
@customElement('agent-select')
export class AgentSelect extends LitElement {
  @property({ type: String }) selected = DEFAULT_TOOL;
  @state() private _open = false;

  static styles = css`
    :host {
      display: inline-flex;
      position: relative;
    }

    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 10px;
      border: 1px solid var(--vscode-dropdown-border, #3c3c3c);
      border-radius: 6px;
      background: var(--vscode-dropdown-background, #1e1e1e);
      color: var(--vscode-dropdown-foreground, #ccc);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s, border-color 0.15s;
    }

    .trigger:hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
      border-color: var(--vscode-focusBorder, #007fd4);
    }

    .agent-icon {
      width: 15px;
      height: 15px;
      opacity: 0.85;
      flex-shrink: 0;
    }

    .caret {
      width: 13px;
      height: 13px;
      opacity: 0.7;
      margin-left: 1px;
      flex-shrink: 0;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 199;
    }

    .menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      z-index: 200;
      background: var(--vscode-menu-background, #252526);
      border: 1px solid var(--vscode-menu-border, #454545);
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      padding: 4px 0;
      min-width: 160px;
      opacity: 0;
      pointer-events: none;
      transform: scale(0.95);
      transform-origin: top left;
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
      justify-content: space-between;
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

    .check {
      font-size: 11px;
    }
  `;

  render() {
    const current = getAgent(this.selected)?.displayName ?? this.selected;
    return html`
      ${this._open ? html`<div class="backdrop" @click="${this._close}"></div>` : ''}
      <button class="trigger" @click="${this._toggle}" title="Working agent — writes target this agent's config dir">
        ${iconAgent('agent-icon')}
        ${current}
        ${iconSelector('caret')}
      </button>
      <div class="menu ${this._open ? 'visible' : ''}">
        ${SELECTABLE_AGENTS.map(agent => html`
          <button class="menu-item" @click="${() => this._pick(agent.id)}">
            ${agent.displayName}
            ${agent.id === this.selected ? html`<span class="check">✓</span>` : ''}
          </button>
        `)}
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
    if (e.key === 'Escape' && this._open) {
      this._open = false;
    }
  };

  private _toggle() {
    this._open = !this._open;
  }

  private _close() {
    this._open = false;
  }

  private _pick(agentId: string) {
    this._open = false;
    if (agentId === this.selected) return;
    this.selected = agentId;
    this.dispatchEvent(new CustomEvent<string>('agent-change', {
      detail: agentId,
      bubbles: true,
      composed: true,
    }));
  }
}
