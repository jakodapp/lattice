import { LitElement, html, css } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { FileEntry, FileGroup, SerializedAsset, SerializedRepo, DiscoveredAssetSerialized, VersionOption, ToExtension, ToWebview, ViewMode, HIDDEN_ASSET_TYPES, isContextFile } from '../types';
import { iconDownload, iconRefresh, iconFolderOpen, iconEyeOff } from '../icons';
import './kanban-board';
import './view-toggle';
import './search-bar';
import './detail-panel';
import './context-menu';
import './repo-picker';
import './asset-picker';
import './version-picker';


declare function acquireVsCodeApi(): { postMessage(msg: ToExtension): void; getState(): unknown; setState(s: unknown): void };

@customElement('dashboard-app')
export class DashboardApp extends LitElement {
  @state() private _repos: SerializedRepo[] = [];
  @state() private _view: ViewMode = 'repo';
  @state() private _search = '';
  @state() private _detailOpen = false;
  @state() private _detailRepo: SerializedRepo | null = null;
  @state() private _detailFileGroups: FileGroup[] = [];
  @state() private _detailClaudeMdFiles: FileEntry[] = [];
  @state() private _navigateToFile: FileEntry | null = null;
  @state() private _assetRepos: string[] = [];
  @state() private _loading = true;
  @state() private _hasRoots = true;
  @query('.root-input') private _rootInputEl!: HTMLInputElement;
  @state() private _ctxMenu: { visible: boolean; x: number; y: number; asset: SerializedAsset | null; instanceCount: number; viewContext: 'repo' | 'type' } = { visible: false, x: 0, y: 0, asset: null, instanceCount: 1, viewContext: 'repo' };
  @state() private _repoPicker: { visible: boolean; action: 'copy' | 'move' | 'install'; asset: SerializedAsset | null } = { visible: false, action: 'copy', asset: null };
  @state() private _repoCtx: { visible: boolean; x: number; y: number; repoName: string; repoPath: string } = { visible: false, x: 0, y: 0, repoName: '', repoPath: '' };
  @state() private _discoveryModal: { visible: boolean; hiddenRepos: Array<{ name: string; path: string }>; uninitializedRepos: Array<{ name: string; path: string }> } = { visible: false, hiddenRepos: [], uninitializedRepos: [] };
  @state() private _assetPicker: { visible: boolean; repoName: string; clonePath: string; sourceUrl: string; assets: DiscoveredAssetSerialized[] } = { visible: false, repoName: '', clonePath: '', sourceUrl: '', assets: [] };
  @state() private _versionPicker: { visible: boolean; assetName: string; assetPath: string; assetRepoName: string; versions: VersionOption[] } = { visible: false, assetName: '', assetPath: '', assetRepoName: '', versions: [] };
  @state() private _pendingGithubInstall: { clonePath: string; sourceUrl: string; assetPaths: string[] } | null = null;

  private _vscode = acquireVsCodeApi();

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      background: var(--vscode-editor-background, #fff);
      color: var(--vscode-foreground, #333);
      font-family: var(--vscode-font-family, system-ui);
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--vscode-panel-border, #e0e0e0);
      background: var(--vscode-titleBar-activeBackground, #f8f8f8);
      flex-shrink: 0;
    }

    .toolbar-title {
      font-weight: 700;
      font-size: 14px;
      margin-right: 8px;
    }

    .spacer {
      flex: 1;
    }

    .toolbar-btn {
      background: none;
      border: 1px solid var(--vscode-panel-border, #ddd);
      border-radius: 4px;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 12px;
      color: var(--vscode-foreground, #333);
    }

    .toolbar-btn:hover {
      background: var(--vscode-list-hoverBackground, #e8e8e8);
    }

    .asset-count {
      font-size: 10px;
      font-weight: 700;
      flex-shrink: 0;
      background: rgba(255,255,255,0.08);
      border: 1px solid var(--vscode-panel-border, #ddd);
      padding: 3px 8px;
      border-radius: 4px;
      opacity: 0.6;
    }

    .refresh-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border, #ddd);
      background: none;
      cursor: pointer;
      color: var(--vscode-foreground, #333);
      flex-shrink: 0;
      transition: background 0.15s;
    }

    .refresh-btn:hover {
      background: var(--vscode-list-hoverBackground, #e8e8e8);
    }

    .refresh-btn svg {
      width: 14px;
      height: 14px;
    }

    .board-container {
      flex: 1;
      overflow: hidden;
    }

    .repo-ctx-overlay { position: fixed; inset: 0; z-index: 199; }
    .repo-ctx-menu {
      position: fixed; z-index: 200;
      background: var(--vscode-menu-background, #252526);
      border: 1px solid var(--vscode-menu-border, #454545);
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      padding: 4px 0;
      min-width: 180px;
    }
    .repo-ctx-item {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 14px; cursor: pointer; font-size: 12px;
      color: var(--vscode-menu-foreground, #ccc);
      border: none; background: none; width: 100%; text-align: left; font-family: inherit;
    }
    .repo-ctx-item:hover { background: var(--vscode-menu-selectionBackground, #094771); color: var(--vscode-menu-selectionForeground, #fff); }
    .repo-ctx-item.danger:hover { background: rgba(239,68,68,0.2); color: #f87171; }
    .repo-ctx-item svg { width: 14px; height: 14px; flex-shrink: 0; }
    .repo-ctx-separator { height: 1px; background: var(--vscode-menu-separatorBackground, #454545); margin: 3px 8px; }

    .discovery-backdrop {
      position: fixed; inset: 0; z-index: 300;
      background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
    }
    .discovery-modal {
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #454545);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      width: min(600px, 90vw);
      max-height: 70vh;
      display: flex; flex-direction: column;
    }
    .discovery-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--vscode-panel-border, #454545);
    }
    .discovery-title { font-size: 14px; font-weight: 600; }
    .discovery-close {
      background: none; border: none; cursor: pointer;
      font-size: 18px; color: var(--vscode-foreground, #ccc);
      padding: 4px 8px; border-radius: 4px;
    }
    .discovery-close:hover { background: rgba(255,255,255,0.1); }
    .discovery-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
    .discovery-section-title {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.5px; color: var(--vscode-descriptionForeground, #888);
      margin-bottom: 8px;
    }
    .discovery-section-title:not(:first-child) { margin-top: 16px; }
    .discovery-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; border-radius: 6px;
      border: 1px solid var(--vscode-panel-border, #454545);
      margin-bottom: 6px;
    }
    .discovery-row:hover { border-color: var(--vscode-focusBorder, #007acc); }
    .discovery-row-info { flex: 1; min-width: 0; }
    .discovery-row-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .discovery-row-path { font-size: 10px; color: var(--vscode-descriptionForeground, #888); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .discovery-btn {
      padding: 4px 12px; border-radius: 4px; border: none; cursor: pointer;
      font-size: 11px; font-weight: 500; flex-shrink: 0;
      background: var(--vscode-button-background, #007acc);
      color: var(--vscode-button-foreground, #fff);
    }
    .discovery-btn:hover { background: var(--vscode-button-hoverBackground, #005fa3); }
    .discovery-btn.secondary {
      background: transparent;
      color: var(--vscode-foreground, #ccc);
      border: 1px solid var(--vscode-panel-border, #454545);
    }
    .discovery-btn.secondary:hover { background: rgba(255,255,255,0.05); }
    .discovery-footer {
      padding: 12px 20px;
      border-top: 1px solid var(--vscode-panel-border, #454545);
      display: flex; justify-content: flex-end; gap: 8px;
    }
    .discovery-empty {
      text-align: center; padding: 24px;
      color: var(--vscode-descriptionForeground, #888); font-size: 12px;
    }

    .loading {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--vscode-descriptionForeground, #888);
      font-size: 13px;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--vscode-panel-border, #ddd);
      border-top-color: var(--vscode-button-background, #007acc);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 40px 24px;
      text-align: center;
    }

    .empty-state-icon {
      width: 48px;
      height: 48px;
      color: var(--vscode-descriptionForeground, #888);
      opacity: 0.5;
    }

    .empty-state-icon svg {
      width: 48px;
      height: 48px;
    }

    .empty-state h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--vscode-foreground, #333);
    }

    .empty-state p {
      margin: 0;
      font-size: 13px;
      color: var(--vscode-descriptionForeground, #888);
      max-width: 400px;
      line-height: 1.5;
    }

    .root-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      max-width: 420px;
    }

    .root-input {
      flex: 1;
      padding: 7px 10px;
      font-size: 13px;
      font-family: var(--vscode-editor-font-family, monospace);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      border-radius: 4px;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #ccc);
      outline: none;
    }

    .root-input:focus {
      border-color: var(--vscode-focusBorder, #007acc);
    }

    .root-input::placeholder {
      color: var(--vscode-input-placeholderForeground, #888);
    }

    .root-add-btn {
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 500;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: var(--vscode-button-background, #007acc);
      color: var(--vscode-button-foreground, #fff);
      white-space: nowrap;
    }

    .root-add-btn:hover {
      background: var(--vscode-button-hoverBackground, #005a9e);
    }

    .root-browse-btn {
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border, #ddd));
      border-radius: 4px;
      cursor: pointer;
      background: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground, #333));
      white-space: nowrap;
    }

    .root-browse-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground, #e8e8e8));
    }

    .empty-state-or {
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #888);
    }

  `;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('message', this._onMessage.bind(this));
    this._vscode.postMessage({ type: 'refresh' });
  }

  private get _uniqueAssetCount(): number {
    const hiddenTypes = HIDDEN_ASSET_TYPES;
    const seen = new Set<string>();
    for (const r of this._repos) {
      for (const a of r.assets) {
        if (hiddenTypes.has(a.type)) continue;
        seen.add(`${a.type}::${a.name}`);
      }
    }
    return seen.size;
  }

  render() {
    if (this._loading) {
      return html`
        <div class="loading">
          <div class="spinner"></div>
          Scanning repositories...
        </div>
      `;
    }
    if (!this._hasRoots) {
      return this._renderEmptyState();
    }
    return html`
      <div class="toolbar">
        <span class="toolbar-title">Lattice</span>
        <view-toggle .view="${this._view}" .repoCount="${this._repos.length}" .assetCount="${this._uniqueAssetCount}" @view-change="${this._onViewChange}"></view-toggle>
        <span class="spacer"></span>
        <search-bar .value="${this._search}" @search-change="${this._onSearchChange}"></search-bar>
        <button class="refresh-btn" @click="${this._importFromGithub}" title="Import from GitHub">
          ${iconDownload()}
        </button>
        <button class="refresh-btn" @click="${this._refresh}" title="Refresh">
          ${iconRefresh()}
        </button>
      </div>
      <div class="board-container">
        <kanban-board
            .repos="${this._repos}"
            .view="${this._view}"
            .searchQuery="${this._search}"
            .selectedRepoName="${this._detailOpen && this._detailRepo ? this._detailRepo.name : ''}"
            @asset-drop="${this._onAssetDrop}"
            @column-header-click="${this._onColumnClick}"
            @open-file="${this._onOpenFile}"
            @delete-asset="${this._onDeleteAsset}"
            @preview-asset="${this._onPreviewFromKanban}"
            @add-repo="${this._addRepo}"
            @show-context-menu="${this._onShowContextMenu}"
            @column-context-menu="${this._onColumnContextMenu}"
          ></kanban-board>
      </div>
      <detail-panel
        .open="${this._detailOpen}"
        .repo="${this._detailRepo}"
        .fileGroups="${this._detailFileGroups}"
        .claudeMdFiles="${this._detailClaudeMdFiles}"
        .navigateToFile="${this._navigateToFile}"
        .assetRepos="${this._assetRepos}"
        @panel-close="${this._onPanelClose}"
        @open-file="${this._onOpenFile}"
        @open-project="${this._onOpenProject}"
        @open-detail="${this._onDetailOpenDetail}"
        @forget-repo="${this._onForgetRepo}"
        @delete-file="${this._onDeleteFile}"
        @show-context-menu="${this._onShowContextMenu}"
        @file-navigate="${this._onFileNavigate}"
      ></detail-panel>
      <context-menu
        .visible="${this._ctxMenu.visible}"
        .x="${this._ctxMenu.x}"
        .y="${this._ctxMenu.y}"
        .asset="${this._ctxMenu.asset}"
        .instanceCount="${this._ctxMenu.instanceCount}"
        .viewContext="${this._ctxMenu.viewContext}"
        @ctx-copy="${this._onCtxCopy}"
        @ctx-delete="${this._onCtxDelete}"
        @ctx-install="${this._onCtxInstall}"
        @ctx-delete-canonical="${this._onCtxDeleteCanonical}"
        @ctx-dismiss="${this._onCtxDismiss}"
        @ctx-diff="${this._onCtxDiff}"
        @ctx-convert-symlink="${this._onCtxConvertSymlink}"
      ></context-menu>
      <repo-picker
        .visible="${this._repoPicker.visible}"
        .action="${this._repoPicker.action}"
        .asset="${this._repoPicker.asset}"
        .repos="${this._repos}"
        @picker-confirm="${this._onPickerConfirm}"
        @picker-dismiss="${this._onPickerDismiss}"
        @picker-add-repo="${this._addRepo}"
      ></repo-picker>
      <asset-picker
        .visible="${this._assetPicker.visible}"
        .assets="${this._assetPicker.assets}"
        .repoName="${this._assetPicker.repoName}"
        @asset-picker-confirm="${this._onAssetPickerConfirm}"
        @asset-picker-dismiss="${this._onAssetPickerDismiss}"
      ></asset-picker>
      <version-picker
        .visible="${this._versionPicker.visible}"
        .versions="${this._versionPicker.versions}"
        .assetName="${this._versionPicker.assetName}"
        .assetPath="${this._versionPicker.assetPath}"
        .assetRepoName="${this._versionPicker.assetRepoName}"
        @version-picker-confirm="${this._onVersionPickerConfirm}"
        @version-picker-dismiss="${this._onVersionPickerDismiss}"
      ></version-picker>
      ${this._repoCtx.visible ? html`
        <div class="repo-ctx-overlay" @click="${this._dismissRepoCtx}" @contextmenu="${(e: Event) => { e.preventDefault(); this._dismissRepoCtx(); }}"></div>
        <div class="repo-ctx-menu" style="left:${Math.min(this._repoCtx.x, window.innerWidth - 200)}px;top:${Math.min(this._repoCtx.y, window.innerHeight - 50)}px">
          <button class="repo-ctx-item" @click="${this._onRepoCtxHide}">
            ${iconEyeOff()}
            Hide repository
          </button>
        </div>
      ` : ''}
      ${this._renderDiscoveryModal()}
    `;
  }

  private _renderEmptyState() {
    return html`
      <div class="empty-state">
        <div class="empty-state-icon">${iconFolderOpen()}</div>
        <h2>No repositories found</h2>
        <p>Add a root directory to scan for projects with <code>.claude/</code> folders.</p>
        <div class="root-input-row">
          <input
            class="root-input"
            type="text"
            placeholder="~/Workplace"
            @keydown="${(e: KeyboardEvent) => { if (e.key === 'Enter') this._submitRoot(); }}"
          />
          <button class="root-add-btn" @click="${this._submitRoot}">Add</button>
        </div>
        <span class="empty-state-or">or</span>
        <button class="root-browse-btn" @click="${this._browseRoot}">Browse for folder...</button>
      </div>
    `;
  }

  private _submitRoot() {
    const value = this._rootInputEl?.value.trim() ?? '';
    if (!value) return;
    this._vscode.postMessage({ type: 'add-root', rootPath: value });
    this._rootInputEl.value = '';
    this._loading = true;
  }

  private _browseRoot() {
    this._vscode.postMessage({ type: 'browse-root' });
  }

  private _onMessage(event: MessageEvent) {
    const msg = event.data as ToWebview;
    switch (msg.type) {
      case 'init':
        this._repos = msg.repos;
        this._view = msg.view;
        this._hasRoots = msg.hasRoots;
        this._loading = false;
        // Auto-open current workspace repo detail
        if (msg.currentRepo) {
          this._vscode.postMessage({ type: 'open-detail', repoName: msg.currentRepo });
        }
        break;
      case 'refresh':
        this._repos = msg.repos;
        this._hasRoots = msg.hasRoots;
        this._loading = false;
        break;
      case 'detail':
        this._detailRepo = msg.repo;
        this._detailFileGroups = msg.fileGroups;
        this._detailClaudeMdFiles = msg.claudeMdFiles;
        this._detailOpen = true;
        break;
      case 'github-assets':
        this._assetPicker = { visible: true, repoName: msg.repoName, clonePath: msg.clonePath, sourceUrl: msg.sourceUrl, assets: msg.assets };
        break;
      case 'version-pick':
        this._versionPicker = { visible: true, assetName: msg.assetName, assetPath: msg.assetPath, assetRepoName: msg.assetRepoName, versions: msg.versions };
        break;
      case 'root-added':
        this._loading = true;
        break;
      case 'asset-preview': {
        // Kanban chip preview: construct a FileEntry and navigate to file-detail
        // For skill directories, use SKILL.md path so the renderer detects markdown
        const previewPath = msg.asset.isDirectory ? `${msg.asset.path}/SKILL.md` : msg.asset.path;
        this._navigateToFile = { name: msg.asset.name, path: previewPath, preview: msg.content };
        this._assetRepos = this._repos
          .filter(r => !r.isCanonical && r.assets.some(a => a.name === msg.asset.name && a.type === msg.asset.type))
          .map(r => r.name);
        this._detailOpen = true;
        break;
      }
      case 'discovered-repos':
        if (msg.hiddenRepos.length === 0 && msg.uninitializedRepos.length === 0) {
          // Nothing to show — fall through to folder picker
          this._vscode.postMessage({ type: 'add-repo' });
        } else {
          this._discoveryModal = { visible: true, hiddenRepos: msg.hiddenRepos, uninitializedRepos: msg.uninitializedRepos };
        }
        break;
    }
  }

  private _onViewChange(e: CustomEvent<ViewMode>) {
    this._view = e.detail;
  }

  private _onSearchChange(e: CustomEvent<string>) {
    this._search = e.detail;
  }

  private _onDetailOpenDetail(e: CustomEvent<{ repoName: string }>) {
    // If clicking the repo we're already showing, ignore
    if (this._detailRepo && this._detailRepo.name === e.detail.repoName) return;
    // Keep _navigateToFile and _assetRepos so the panel stays in file-detail mode
    this._vscode.postMessage({ type: 'open-detail', repoName: e.detail.repoName });
  }

  private _onAssetDrop(e: CustomEvent<{ asset: SerializedAsset; targetRepoName: string; action: 'copy' | 'replace' | 'move' }>) {
    const { asset, targetRepoName, action } = e.detail;
    if (action === 'move') {
      this._vscode.postMessage({
        type: 'move-asset',
        assetPath: asset.path,
        assetRepoName: asset.repoName,
        targetRepoName,
      });
    } else {
      this._vscode.postMessage({
        type: 'copy-asset',
        assetPath: asset.path,
        assetRepoName: asset.repoName,
        targetRepoName,
      });
    }
  }

  private _onColumnClick(e: CustomEvent<{ repoName: string }>) {
    if (this._view === 'repo') {
      this._vscode.postMessage({ type: 'open-detail', repoName: e.detail.repoName });
    }
  }

  private _onPreviewFromKanban(e: CustomEvent<SerializedAsset>) {
    const asset = e.detail;
    this._navigateToFile = null;
    this._assetRepos = this._repos
      .filter(r => !r.isCanonical && r.assets.some(a => a.name === asset.name && a.type === asset.type))
      .map(r => r.name);
    this._detailOpen = true;

    if (this._view === 'repo') {
      // From Repo view: we know which repo the chip belongs to — select it
      const repo = this._repos.find(r => r.name === asset.repoName);
      if (repo) {
        this._detailRepo = { name: repo.name, path: repo.path, claudePath: repo.claudePath, assets: repo.assets };
      }
      this._vscode.postMessage({ type: 'open-detail', repoName: asset.repoName });
    } else {
      // From Assets view: no repo selected — let the user pick
      this._detailRepo = null;
      this._detailFileGroups = [];
      this._detailClaudeMdFiles = [];
    }
    this._vscode.postMessage({ type: 'preview-asset', assetPath: asset.path });
  }

  private _onOpenFile(e: CustomEvent<{ path: string }>) {
    this._vscode.postMessage({ type: 'open-file', assetPath: e.detail.path });
  }

  private _onOpenProject(e: CustomEvent<{ repoPath: string }>) {
    this._vscode.postMessage({ type: 'open-project', repoPath: e.detail.repoPath });
  }

  private _onDeleteAsset(e: CustomEvent<SerializedAsset>) {
    const asset = e.detail;
    this._vscode.postMessage({ type: 'delete-asset', assetPath: asset.path, repoName: asset.repoName, viewContext: this._view === 'type' ? 'type' : 'repo' });
  }

  private _onColumnContextMenu(e: CustomEvent<{ repoName: string; x: number; y: number }>) {
    const repo = this._repos.find(r => r.name === e.detail.repoName);
    this._repoCtx = { visible: true, x: e.detail.x, y: e.detail.y, repoName: e.detail.repoName, repoPath: repo?.path ?? '' };
  }

  private _dismissRepoCtx() {
    this._repoCtx = { ...this._repoCtx, visible: false };
  }

  private _onRepoCtxHide() {
    this._vscode.postMessage({ type: 'hide-repo', repoPath: this._repoCtx.repoPath });
    this._repoCtx = { ...this._repoCtx, visible: false };
  }

  private _onShowContextMenu(e: CustomEvent<{ x: number; y: number; asset: SerializedAsset }>) {
    const asset = e.detail.asset;
    const instanceCount = this._repos.filter(r => !r.isCanonical && r.assets.some(a => a.name === asset.name && a.type === asset.type)).length;
    this._ctxMenu = { visible: true, x: e.detail.x, y: e.detail.y, asset, instanceCount, viewContext: this._view === 'type' ? 'type' : 'repo' };
  }

  private _onCtxDismiss() {
    this._ctxMenu = { ...this._ctxMenu, visible: false };
  }

  private _onCtxCopy(e: CustomEvent<SerializedAsset>) {
    this._ctxMenu = { ...this._ctxMenu, visible: false };
    this._repoPicker = { visible: true, action: 'copy', asset: e.detail };
  }

  private _onCtxInstall(e: CustomEvent<SerializedAsset>) {
    this._ctxMenu = { ...this._ctxMenu, visible: false };
    this._repoPicker = { visible: true, action: 'install', asset: e.detail };
  }

  private _onCtxDeleteCanonical(e: CustomEvent<SerializedAsset>) {
    this._ctxMenu = { ...this._ctxMenu, visible: false };
    this._vscode.postMessage({ type: 'delete-canonical', assetPath: e.detail.path });
  }

  private _onCtxDelete(e: CustomEvent<SerializedAsset>) {
    this._ctxMenu = { ...this._ctxMenu, visible: false };
    this._vscode.postMessage({ type: 'delete-asset', assetPath: e.detail.path, repoName: e.detail.repoName, viewContext: this._view === 'type' ? 'type' : 'repo' });
  }

  private _onCtxDiff(e: CustomEvent<SerializedAsset>) {
    this._ctxMenu = { ...this._ctxMenu, visible: false };
    this._vscode.postMessage({ type: 'diff-with', assetPath: e.detail.path, assetRepoName: e.detail.repoName });
  }

  private _onCtxConvertSymlink(e: CustomEvent<SerializedAsset>) {
    this._ctxMenu = { ...this._ctxMenu, visible: false };
    this._vscode.postMessage({ type: 'convert-to-symlink', assetPath: e.detail.path, assetRepoName: e.detail.repoName });
  }

  private _onPickerConfirm(e: CustomEvent<{ action: string; asset: SerializedAsset; targetRepoNames: string[] }>) {
    const { action, asset, targetRepoNames } = e.detail;
    this._repoPicker = { ...this._repoPicker, visible: false };

    // If this picker was opened for a GitHub import flow, route differently
    if (this._pendingGithubInstall) {
      const { clonePath, sourceUrl, assetPaths } = this._pendingGithubInstall;
      this._pendingGithubInstall = null;
      this._vscode.postMessage({ type: 'install-github-assets', clonePath, sourceUrl, assetPaths, targetRepoNames });
      return;
    }

    switch (action) {
      case 'copy':
        this._vscode.postMessage({ type: 'copy-asset-to-repos', assetPath: asset.path, assetRepoName: asset.repoName, targetRepoNames });
        break;
      case 'move':
        this._vscode.postMessage({ type: 'move-asset-to-repo', assetPath: asset.path, assetRepoName: asset.repoName, targetRepoName: targetRepoNames[0] });
        break;
      case 'install':
        this._vscode.postMessage({ type: 'install-canonical', assetPath: asset.path, targetRepoNames });
        break;
    }
  }

  private _onPickerDismiss() {
    this._repoPicker = { ...this._repoPicker, visible: false };
    // If pending GitHub install was cancelled at repo-picker stage, clean up
    if (this._pendingGithubInstall) {
      this._vscode.postMessage({ type: 'cleanup-clone', clonePath: this._pendingGithubInstall.clonePath });
      this._pendingGithubInstall = null;
    }
  }

  private _onAssetPickerConfirm(e: CustomEvent<{ selectedPaths: string[] }>) {
    const { selectedPaths } = e.detail;
    // Store pending state, then open repo-picker to choose target repos
    this._pendingGithubInstall = { clonePath: this._assetPicker.clonePath, sourceUrl: this._assetPicker.sourceUrl, assetPaths: selectedPaths };
    this._assetPicker = { ...this._assetPicker, visible: false };
    // Create a dummy asset for the repo-picker (used for display only)
    const dummyAsset: SerializedAsset = {
      name: `${selectedPaths.length} assets from ${this._assetPicker.repoName}`,
      type: 'skill', path: '', isDirectory: false, hash: '', repoName: '',
    };
    this._repoPicker = { visible: true, action: 'copy', asset: dummyAsset };
  }

  private _onAssetPickerDismiss() {
    this._assetPicker = { ...this._assetPicker, visible: false };
    this._vscode.postMessage({ type: 'cleanup-clone', clonePath: this._assetPicker.clonePath });
  }

  private _onVersionPickerConfirm(e: CustomEvent<{ selectedPath: string }>) {
    const { selectedPath } = e.detail;
    this._versionPicker = { ...this._versionPicker, visible: false };
    this._vscode.postMessage({
      type: 'convert-to-symlink-confirm',
      assetPath: this._versionPicker.assetPath,
      assetRepoName: this._versionPicker.assetRepoName,
      sourceAssetPath: selectedPath,
    });
  }

  private _onVersionPickerDismiss() {
    this._versionPicker = { ...this._versionPicker, visible: false };
  }

  // --- Discovery modal ---

  private _renderDiscoveryModal() {
    if (!this._discoveryModal.visible) return html``;

    const { hiddenRepos, uninitializedRepos } = this._discoveryModal;
    const hasContent = hiddenRepos.length > 0 || uninitializedRepos.length > 0;

    return html`
      <div class="discovery-backdrop" @click="${this._dismissDiscovery}" @contextmenu="${(e: Event) => { e.preventDefault(); this._dismissDiscovery(); }}">
        <div class="discovery-modal" @click="${(e: Event) => e.stopPropagation()}">
          <div class="discovery-header">
            <span class="discovery-title">Discover Repositories</span>
            <button class="discovery-close" @click="${this._dismissDiscovery}">&#x2715;</button>
          </div>
          <div class="discovery-body">
            ${!hasContent ? html`<div class="discovery-empty">No hidden or uninitialized repositories found</div>` : ''}
            ${hiddenRepos.length > 0 ? html`
              <div class="discovery-section-title">Hidden repositories</div>
              ${hiddenRepos.map(r => html`
                <div class="discovery-row">
                  <div class="discovery-row-info">
                    <div class="discovery-row-name">${r.name}</div>
                    <div class="discovery-row-path">${r.path}</div>
                  </div>
                  <button class="discovery-btn" @click="${() => this._onUnhideRepo(r.path)}">Unhide</button>
                </div>
              `)}
            ` : ''}
            ${uninitializedRepos.length > 0 ? html`
              <div class="discovery-section-title">Available repositories</div>
              ${uninitializedRepos.map(r => html`
                <div class="discovery-row">
                  <div class="discovery-row-info">
                    <div class="discovery-row-name">${r.name}</div>
                    <div class="discovery-row-path">${r.path}</div>
                  </div>
                  <button class="discovery-btn" @click="${() => this._onInitRepo(r.path)}">Add</button>
                </div>
              `)}
            ` : ''}
          </div>
          <div class="discovery-footer">
            <button class="discovery-btn secondary" @click="${this._onBrowseForRepo}">Browse for folder...</button>
            <span style="flex:1"></span>
            <button class="discovery-btn secondary" @click="${this._dismissDiscovery}">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  private _dismissDiscovery() {
    this._discoveryModal = { ...this._discoveryModal, visible: false };
  }

  private _onUnhideRepo(repoPath: string) {
    this._vscode.postMessage({ type: 'unhide-repo', repoPath });
    this._discoveryModal = { ...this._discoveryModal, visible: false };
  }

  private _onInitRepo(repoPath: string) {
    this._vscode.postMessage({ type: 'add-repo', repoPath });
    this._discoveryModal = { ...this._discoveryModal, visible: false };
  }

  private _onBrowseForRepo() {
    this._discoveryModal = { ...this._discoveryModal, visible: false };
    this._vscode.postMessage({ type: 'add-repo' });
  }

  private _importFromGithub() {
    this._vscode.postMessage({ type: 'import-from-github' });
  }

  private _onFileNavigate(e: CustomEvent<{ fileName: string; filePath: string }>) {
    const asset = this._detailRepo?.assets.find(a => a.name === e.detail.fileName || a.path === e.detail.filePath);
    if (!asset || isContextFile(asset)) {
      this._assetRepos = [];
      return;
    }
    this._assetRepos = this._repos
      .filter(r => !r.isCanonical && r.assets.some(a => a.name === asset.name && a.type === asset.type))
      .map(r => r.name);
  }

  private _onDeleteFile(e: CustomEvent<{ path: string; repoName: string }>) {
    const viewContext = e.detail.repoName ? 'repo' as const : 'type' as const;
    this._vscode.postMessage({ type: 'delete-asset', assetPath: e.detail.path, repoName: e.detail.repoName, viewContext });
  }

  private _onPanelClose() {
    this._detailOpen = false;
    this._navigateToFile = null;
    this._assetRepos = [];
  }

  private _onForgetRepo(e: CustomEvent<{ repoName: string }>) {
    this._detailOpen = false;
    this._navigateToFile = null;
    this._assetRepos = [];
    this._vscode.postMessage({ type: 'forget-repo', repoName: e.detail.repoName });
  }

  private _addRepo() {
    this._vscode.postMessage({ type: 'discover-repos' });
  }


  private _refresh() {
    this._vscode.postMessage({ type: 'refresh' });
  }
}
