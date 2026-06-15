import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { AssetType, SerializedAsset } from '../types';
import { iconWarning, iconLink, iconTrash, iconUpdate } from '../icons';

@customElement('asset-chip')
export class AssetChip extends LitElement {
  @property({ type: Object }) asset!: SerializedAsset;
  @property({ type: Boolean }) diverged = false;
  @property({ type: Boolean }) hasUpdate = false;
  @property({ type: Array }) tools: string[] = [];
  @property({ type: Number }) copies = 1;
  /** Asset is not usable by the selected agent — greyed out, not draggable */
  @property({ type: Boolean }) disabled = false;

  static styles = css`
    :host {
      display: block;
      margin: 4px 0;
    }

    .chip {
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      cursor: grab;
      border: 1px solid transparent;
      transition: transform 0.1s, box-shadow 0.1s, opacity 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
      user-select: none;
    }

    .chip:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .chip:active {
      cursor: grabbing;
      opacity: 0.7;
    }

    .chip.dragging {
      opacity: 0.4;
    }

    .chip.disabled {
      opacity: 0.45;
      filter: grayscale(0.7);
      cursor: default;
    }

    .chip.disabled:hover {
      transform: none;
      box-shadow: none;
    }

    .chip[data-type="skill"]   { background: var(--color-skill-bg);   border-color: var(--color-skill-border);   color: var(--color-skill); }
    .chip[data-type="command"] { background: var(--color-command-bg); border-color: var(--color-command-border); color: var(--color-command); }
    .chip[data-type="agent"]   { background: var(--color-agent-bg);   border-color: var(--color-agent-border);   color: var(--color-agent); }
    .chip[data-type="rule"]    { background: var(--color-rule-bg);    border-color: var(--color-rule-border);    color: var(--color-rule); }
    .chip[data-type="script"]  { background: var(--color-script-bg);  border-color: var(--color-script-border);  color: var(--color-script); }
    .chip[data-type="hook"]    { background: rgba(20,184,166,0.12); border-color: rgba(20,184,166,0.35); color: #14B8A6; }
    .chip[data-type="output-style"] { background: rgba(221,51,250,0.12); border-color: rgba(221,51,250,0.35); color: #DD33FA; }
    .chip[data-type="workflow"] { background: rgba(99,102,241,0.12); border-color: rgba(99,102,241,0.35); color: #6366F1; }
    .chip[data-type="instructions"] { background: rgba(232,123,53,0.12); border-color: rgba(232,123,53,0.35); color: #E87B35; }
    .chip[data-type="settings"] { background: hsl(0,0%,92%); border-color: hsl(0,0%,75%); color: hsl(0,0%,35%); }
    .chip[data-type="claude-md"] { background: hsl(45,70%,92%); border-color: hsl(45,55%,75%); color: hsl(45,55%,25%); }
    .chip[data-type="mcp-config"] { background: hsl(340,50%,92%); border-color: hsl(340,40%,75%); color: hsl(340,40%,30%); }

    .type-badge {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.8;
      font-weight: 700;
    }

    .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .chip-trailing {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      position: relative;
      width: 16px;
      height: 16px;
    }

    .chip-trailing svg {
      width: 12px;
      height: 12px;
      position: absolute;
      right: 0;
    }

    .chain-icon { opacity: 0.4; transition: opacity 0.15s; }
    .trash-icon { opacity: 0; cursor: pointer; transition: opacity 0.15s; }

    /* Symlink chip: show chain, swap to trash on hover */
    .chip:hover .chain-icon { opacity: 0; }
    .chip:hover .trash-icon { opacity: 0.5; }
    .trash-icon:hover { opacity: 1 !important; }

    /* Local chip: trash hidden by default, show on hover */
    .local-trash { opacity: 0; cursor: pointer; transition: opacity 0.15s; }
    .chip:hover .local-trash { opacity: 0.5; }
    .local-trash:hover { opacity: 1 !important; }

    .warn-icon {
      width: 12px; height: 12px; flex-shrink: 0;
      color: #EAB308; opacity: 0.8;
      transition: opacity 0.15s;
    }

    .chip:hover .warn-icon { opacity: 0; }
    .chip:hover .warn-icon + .trash-icon,
    .chip:hover .warn-icon + .local-trash { opacity: 0.5; }

    .update-icon {
      width: 12px; height: 12px; flex-shrink: 0;
      color: #22c55e; opacity: 0.9;
    }

    .tool-badge {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(127,127,127,0.18);
      opacity: 0.85;
      flex-shrink: 0;
    }

    .copies-badge {
      font-size: 9px;
      font-weight: 700;
      opacity: 0.6;
      flex-shrink: 0;
    }
  `;

  private _dragging = false;

  render() {
    const typeLabel = this._getTypeLabel(this.asset.type);
    const toolInfo = this.tools.length > 0 ? this.tools.join(', ') : this.asset.tool;
    return html`
      <div
        class="chip ${this._dragging ? 'dragging' : ''} ${this.disabled ? 'disabled' : ''}"
        data-type="${this.asset.type}"
        draggable="${!this.disabled}"
        @dragstart="${this._onDragStart}"
        @dragend="${this._onDragEnd}"
        @click="${this._onPreview}"
        @contextmenu="${this._onContextMenu}"
        title="${this.asset.name} (${typeLabel}${toolInfo ? `, ${toolInfo}` : ''})${this.disabled ? '\nNot configured for the selected agent — use "Export to agent…" to enable it' : ''}\n${this.asset.path}"
      >
        <span class="type-badge">${typeLabel}</span>
        <span class="name">${this.asset.name}</span>
        ${this.tools.map(t => html`<span class="tool-badge">${t}</span>`)}
        ${this.copies > 1 ? html`<span class="copies-badge">×${this.copies}</span>` : ''}
        ${this.hasUpdate ? iconUpdate('update-icon') : ''}
        <span class="chip-trailing" @click="${this._onDelete}" title="${this.asset.isSymlink ? 'Remove from repo' : 'Delete'}">
          ${this.diverged ? iconWarning('warn-icon') : this.asset.isSymlink ? iconLink('chain-icon') : ''}
          ${iconTrash(this.diverged || this.asset.isSymlink ? 'trash-icon' : 'local-trash')}
        </span>
      </div>
    `;
  }

  private _onDragStart(e: DragEvent) {
    if (this.disabled) {
      e.preventDefault();
      return;
    }
    this._dragging = true;
    this.requestUpdate();
    e.dataTransfer!.setData('application/json', JSON.stringify(this.asset));
    e.dataTransfer!.effectAllowed = 'copyMove';
  }

  private _onDragEnd() {
    this._dragging = false;
    this.requestUpdate();
  }

  private _onPreview(_e: Event) {
    this.dispatchEvent(new CustomEvent('preview-asset', { detail: this.asset, bubbles: true, composed: true }));
  }

  private _onDelete(e: Event) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('delete-asset', { detail: this.asset, bubbles: true, composed: true }));
  }

  private _onContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('show-context-menu', {
      detail: { x: e.clientX, y: e.clientY, asset: this.asset },
      bubbles: true, composed: true,
    }));
  }

  private _getTypeLabel(type: AssetType): string {
    const labels: Record<AssetType, string> = {
      'skill': 'SKL',
      'command': 'CMD',
      'agent': 'AGT',
      'rule': 'RUL',
      'workflow': 'WFL',
      'script': 'SCR',
      'hook': 'HKS',
      'mcp-config': 'MCP',
      'output-style': 'STY',
      'settings': 'SET',
      'claude-md': 'MD',
      'instructions': 'INS',
    };
    return labels[type];
  }
}
