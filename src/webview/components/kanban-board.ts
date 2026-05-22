import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SerializedAsset, SerializedRepo, ViewMode, AssetType, ASSET_TYPE_LABELS, HIDDEN_ASSET_TYPES, ASSET_TYPE_ORDER } from '../types';
import { iconWarning } from '../icons';
import './kanban-column';

@customElement('kanban-board')
export class KanbanBoard extends LitElement {
  @property({ type: Array }) repos: SerializedRepo[] = [];
  @property({ type: String }) view: ViewMode = 'repo';
  @property({ type: String }) searchQuery = '';
  @property({ type: String }) selectedRepoName = '';
  @state() private _typeFilter: AssetType | '' = '';

  /** Compute set of asset keys (type::name) that have diverged hashes across repos */
  private get _divergedKeys(): Set<string> {
    const groups = new Map<string, Set<string>>();
    for (const repo of this.repos) {
      if (repo.isCanonical) continue;
      for (const a of repo.assets) {
        const key = `${a.type}::${a.name}`;
        const hashes = groups.get(key) ?? new Set<string>();
        hashes.add(a.hash);
        groups.set(key, hashes);
      }
    }
    const diverged = new Set<string>();
    for (const [key, hashes] of groups) {
      if (hashes.size > 1) diverged.add(key);
    }
    return diverged;
  }

  private _lastEmittedCount = -1;

  updated(changed: Map<string, unknown>) {
    if (changed.has('view')) { this._typeFilter = ''; }
    // Emit filtered count after every render
    const count = this._computeFilteredCount();
    if (count !== this._lastEmittedCount) {
      this._lastEmittedCount = count;
      this.dispatchEvent(new CustomEvent('filtered-count', { detail: count, bubbles: true, composed: true }));
    }
  }

  private _computeFilteredCount(): number {
    if (this.view === 'type') {
      const grouped = this._groupByNameAndType();
      const typeFilter = this._typeFilter;
      const filtered = typeFilter ? grouped.filter(g => g.type === typeFilter) : grouped;
      return filtered.length;
    }

    // Repo view: sum of filtered assets across filtered repos
    const filteredRepos = this._filterRepos();
    let count = 0;
    for (const repo of filteredRepos) {
      count += this._filterAssets(repo.assets).length;
    }
    return count;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .board {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
      padding: 16px 16px 20px;
      overflow-y: auto;
      height: 100%;
      align-content: start;
      box-sizing: border-box;
    }

    /* Visible vertical scrollbar */
    .board::-webkit-scrollbar {
      width: 10px;
    }

    .board::-webkit-scrollbar-track {
      background: var(--vscode-scrollbar-shadow, rgba(0,0,0,0.05));
      border-radius: 5px;
    }

    .board::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background, rgba(100,100,100,0.4));
      border-radius: 5px;
    }

    .board::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground, rgba(100,100,100,0.6));
    }

    .add-repo-link {
      grid-column: 1 / -1;
      text-align: left;
      padding: 0 4px 4px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #888);
    }

    .add-repo-link a {
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      text-decoration: none;
    }

    .add-repo-link a:hover {
      text-decoration: underline;
    }

    /* By Type card list */
    .type-view { padding: 16px 16px 20px; overflow-y: auto; height: 100%; box-sizing: border-box; }

    .type-filters { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
    .type-pill {
      padding: 4px 12px;
      border-radius: 14px;
      border: 1px solid var(--vscode-panel-border, #ddd);
      background: transparent;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.15s;
    }
    .type-pill:hover { color: var(--vscode-foreground, #333); border-color: var(--vscode-foreground, #666); }
    .type-pill.active { background: var(--vscode-button-background, #007acc); color: var(--vscode-button-foreground, #fff); border-color: transparent; }
    .type-pill .pill-count { font-size: 10px; margin-left: 4px; opacity: 0.7; font-family: monospace; }

    .card-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; align-content: start; }

    .asset-card {
      border: 1px solid var(--vscode-panel-border, #ddd);
      border-radius: 8px;
      padding: 14px 16px;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background, #f8f8f8));
      transition: border-color 0.15s, transform 0.15s;
      cursor: pointer;
      border-left: 3px solid transparent;
      position: relative;
    }
    .card-warn {
      position: absolute; bottom: 8px; right: 10px;
      width: 14px; height: 14px; color: #EAB308; opacity: 0.7;
    }
    .asset-card:hover { border-color: var(--vscode-focusBorder, #007acc); transform: translateY(-1px); }
    .asset-card[data-type="skill"]   { border-color: color-mix(in srgb, var(--color-skill, #0080FF) 30%, transparent); border-left-color: var(--color-skill, #0080FF); }
    .asset-card[data-type="command"] { border-color: color-mix(in srgb, var(--color-command, #00FF41) 30%, transparent); border-left-color: var(--color-command, #00FF41); }
    .asset-card[data-type="agent"]   { border-color: color-mix(in srgb, var(--color-agent, #EAB308) 30%, transparent); border-left-color: var(--color-agent, #EAB308); }
    .asset-card[data-type="rule"]    { border-color: color-mix(in srgb, var(--color-rule, #EF4444) 30%, transparent); border-left-color: var(--color-rule, #EF4444); }
    .asset-card[data-type="script"]  { border-color: color-mix(in srgb, var(--color-script, hsl(320,60%,60%)) 30%, transparent); border-left-color: var(--color-script, hsl(320,60%,60%)); }
    .asset-card[data-type="hook"]    { border-color: color-mix(in srgb, #14B8A6 30%, transparent); border-left-color: #14B8A6; }
    .asset-card[data-type="output-style"] { border-color: color-mix(in srgb, #DD33FA 30%, transparent); border-left-color: #DD33FA; }

    .card-header-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .card-header-row .card-title { flex: 1; min-width: 0; }
    .card-header-row .card-tag { flex-shrink: 0; }
    .card-title { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .card-preview { font-family: var(--vscode-editor-font-family, 'Menlo, Monaco, monospace'); font-size: 11px; color: var(--vscode-descriptionForeground, #888); line-height: 1.5; margin-bottom: 8px; padding: 8px 10px; background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.08)); border: 1px solid var(--vscode-panel-border, #ddd); border-radius: 4px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; white-space: pre-wrap; }
    .card-stats { font-size: 11px; color: var(--vscode-descriptionForeground, #888); margin-bottom: 8px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .card-stat { display: flex; align-items: center; gap: 3px; }
    .asset-card.available-only { opacity: 0.75; border-style: dashed; }
    .card-tag.available { background: rgba(59,130,246,0.12); color: #3B82F6; font-weight: 400; text-transform: none; }
    .repo-pill { font-size: 10px; padding: 2px 7px; border-radius: 3px; background: rgba(128,128,128,0.1); color: var(--vscode-descriptionForeground, #888); }
    .repo-more { font-size: 10px; color: var(--vscode-descriptionForeground, #666); opacity: 0.7; }
    .card-tags { display: flex; gap: 4px; flex-wrap: wrap; }
    .card-tag {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 3px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .card-tag[data-type="skill"]   { background: var(--color-skill-bg, rgba(0,128,255,0.12));   color: var(--color-skill, #0080FF); }
    .card-tag[data-type="command"] { background: var(--color-command-bg, rgba(0,255,65,0.12)); color: var(--color-command, #00FF41); }
    .card-tag[data-type="agent"]   { background: var(--color-agent-bg, rgba(234,179,8,0.12));   color: var(--color-agent, #EAB308); }
    .card-tag[data-type="rule"]    { background: var(--color-rule-bg, rgba(239,68,68,0.12));    color: var(--color-rule, #EF4444); }
    .card-tag[data-type="script"]  { background: var(--color-script-bg, hsl(320,60%,95%));  color: var(--color-script, hsl(320,60%,60%)); }
    .card-tag[data-type="hook"]    { background: rgba(20,184,166,0.12);  color: #14B8A6; }
    .card-tag[data-type="output-style"] { background: rgba(221,51,250,0.12); color: #DD33FA; }
  `;

  render() {
    if (this.view === 'type') {
      return html`${this._renderByType()}`;
    }
    const columns = this._renderByRepo();
    return html`
      <div class="board">
        ${columns}
      </div>
    `;
  }

  private _renderByRepo() {
    const filteredRepos = this._filterRepos().filter(r => !r.isCanonical);
    return html`
      <div class="add-repo-link">
        <a @click="${this._onAddRepo}">Can't find your repository?</a>
      </div>
      ${filteredRepos.map(repo => html`
        <kanban-column
          .columnTitle="${repo.name}"
          .assets="${this._filterAssets(repo.assets)}"
          .repoName="${repo.name}"
          .selected="${repo.name === this.selectedRepoName}"
          .isGlobal="${repo.isGlobal ?? false}"
          .isCanonical="${repo.isCanonical ?? false}"
          .divergedKeys="${this._divergedKeys}"
          @asset-drop-at="${this._onAssetDropAt}"
        ></kanban-column>
      `)}
    `;
  }

  private _onAddRepo() {
    this.dispatchEvent(new CustomEvent('add-repo', { bubbles: true, composed: true }));
  }

  private _renderByType() {
    const grouped = this._groupByNameAndType();
    const typeFilter = this._typeFilter;

    // Count per type for pills (ordered)
    const typeCounts: Partial<Record<AssetType, number>> = {};
    for (const g of grouped) {
      typeCounts[g.type] = (typeCounts[g.type] ?? 0) + 1;
    }
    const allTypes = ASSET_TYPE_ORDER.filter(t => typeCounts[t]);

    const filtered = typeFilter ? grouped.filter(g => g.type === typeFilter) : grouped;

    return html`
      <div class="type-view">
        <div class="type-filters">
          <button class="type-pill ${typeFilter === '' ? 'active' : ''}" @click="${() => this._typeFilter = ''}">
            All<span class="pill-count">${grouped.length}</span>
          </button>
          ${allTypes.map(t => html`
            <button class="type-pill ${typeFilter === t ? 'active' : ''}" @click="${() => this._typeFilter = this._typeFilter === t ? '' : t}">
              ${ASSET_TYPE_LABELS[t]}<span class="pill-count">${typeCounts[t]}</span>
            </button>
          `)}
        </div>
        <div class="card-list">
          ${filtered.map(g => {
            const repoInstances = g.instances.filter(i => !i.isCanonical);
            const isAvailableOnly = repoInstances.length === 0;
            const isDiverged = new Set(repoInstances.map(i => i.hash)).size > 1;
            return html`
              <div class="asset-card ${isAvailableOnly ? 'available-only' : ''}" data-type="${g.type}" @click="${() => this._onCardClick(g.instances[0])}" @contextmenu="${(e: MouseEvent) => this._onCardContextMenu(e, g.instances[0])}">
                <div class="card-header-row">
                  <div class="card-title">${g.name}</div>
                  <span class="card-tag" data-type="${g.type}">${ASSET_TYPE_LABELS[g.type]}</span>
                </div>
                ${g.preview ? html`<div class="card-preview">${g.preview}</div>` : ''}
                <div class="card-stats">
                  ${isAvailableOnly
                    ? html`<span class="card-stat" style="opacity:0.5">Not installed in any repo</span>`
                    : html`
                      ${repoInstances.slice(0, 2).map(i => html`<span class="repo-pill">${i.repoName}</span>`)}
                      ${repoInstances.length > 2 ? html`<span class="repo-more">+${repoInstances.length - 2} more</span>` : ''}
                    `}
                </div>
                ${isDiverged ? html`
                  ${iconWarning('card-warn')}
                ` : ''}
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  /** Group assets by (type, name) across all repos — one card per unique asset */
  private _groupByNameAndType(): Array<{ name: string; type: AssetType; preview: string; instances: SerializedAsset[] }> {
    const hiddenTypes = HIDDEN_ASSET_TYPES;
    const map = new Map<string, { name: string; type: AssetType; preview: string; instances: SerializedAsset[] }>();
    const q = this.searchQuery?.toLowerCase() ?? '';

    for (const repo of this.repos) {
      for (const asset of repo.assets) {
        if (hiddenTypes.has(asset.type)) continue;
        if (q && !asset.name.toLowerCase().includes(q)) continue;
        const key = `${asset.type}::${asset.name}`;
        let group = map.get(key);
        if (!group) {
          group = { name: asset.name, type: asset.type, preview: asset.preview ?? '', instances: [] };
          map.set(key, group);
        }
        group.instances.push(asset);
        // Use first non-empty preview
        if (!group.preview && asset.preview) { group.preview = asset.preview; }
      }
    }

    const typeIndex = new Map(ASSET_TYPE_ORDER.map((t, i) => [t, i]));
    return Array.from(map.values()).sort((a, b) => {
      const ta = typeIndex.get(a.type) ?? 99;
      const tb = typeIndex.get(b.type) ?? 99;
      return ta !== tb ? ta - tb : a.name.localeCompare(b.name);
    });
  }

  private _onCardContextMenu(e: MouseEvent, asset: SerializedAsset) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('show-context-menu', {
      detail: { x: e.clientX, y: e.clientY, asset },
      bubbles: true, composed: true,
    }));
  }

  private _onCardClick(asset: SerializedAsset) {
    this.dispatchEvent(new CustomEvent('preview-asset', { detail: asset, bubbles: true, composed: true }));
  }

  private _filterRepos(): SerializedRepo[] {
    let filtered = this.repos;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.assets.some(a => a.name.toLowerCase().includes(q))
      );
    }
    return filtered;
  }

  private _filterAssets(assets: SerializedAsset[]): SerializedAsset[] {
    const hiddenTypes = HIDDEN_ASSET_TYPES;
    let filtered = assets.filter(a => !hiddenTypes.has(a.type));
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(a => a.name.toLowerCase().includes(q));
    }
    const typeIndex = new Map(ASSET_TYPE_ORDER.map((t, i) => [t, i]));
    filtered.sort((a, b) => {
      const ta = typeIndex.get(a.type as AssetType) ?? 99;
      const tb = typeIndex.get(b.type as AssetType) ?? 99;
      return ta !== tb ? ta - tb : a.name.localeCompare(b.name);
    });
    return filtered;
  }



  /** Called when an asset is dropped on a column — executes immediately without context menu */
  private _onAssetDropAt(e: CustomEvent<{ asset: SerializedAsset; targetRepoName: string; x: number; y: number }>) {
    const { asset, targetRepoName } = e.detail;
    if (asset.repoName === targetRepoName) { return; }

    this.dispatchEvent(new CustomEvent('asset-drop', {
      detail: { asset, targetRepoName, action: 'copy' },
      bubbles: true, composed: true,
    }));
  }
}
