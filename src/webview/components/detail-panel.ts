import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import { FileEntry, FileGroup, SerializedRepo } from '../types';
import { iconExternal, iconCopy, iconTrash, iconLink } from '../icons';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);

type PanelMode = 'detail' | 'file-detail';

@customElement('detail-panel')
export class DetailPanel extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: Object }) repo: SerializedRepo | null = null;
  @property({ type: Array }) fileGroups: FileGroup[] = [];
  @property({ type: Array }) claudeMdFiles: FileEntry[] = [];

  /** Set externally by dashboard-app for kanban→file-detail flow */
  @property({ type: Object }) navigateToFile: FileEntry | null = null;
  /** Repo names where the current asset is installed (for asset preview) */
  @property({ type: Array }) assetRepos: string[] = [];

  @state() private _mode: PanelMode = 'detail';
  @state() private _viewingFile: FileEntry | null = null;
  @state() private _width = Math.max(480, window.innerWidth * 0.6);
  @state() private _dragging = false;

  private static readonly SPLIT_THRESHOLD = 700;

  private get _isSplitView(): boolean {
    return this._width >= DetailPanel.SPLIT_THRESHOLD;
  }

  static styles = css`
    :host {
      display: block;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 100;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s;
    }

    .overlay.open {
      opacity: 1;
      pointer-events: all;
    }

    .panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      min-width: 480px;
      max-width: 95vw;
      background: var(--vscode-editor-background, #fff);
      border-left: 1px solid var(--vscode-panel-border, #ddd);
      z-index: 101;
      transform: translateX(100%);
      transition: transform 0.25s ease;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel.open {
      transform: translateX(0);
    }

    .panel.dragging {
      transition: none;
      user-select: none;
    }

    /* Resize handle */
    .resize-handle {
      position: absolute;
      left: -3px;
      top: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
      z-index: 10;
      background: transparent;
      transition: background 0.15s;
    }

    .resize-handle:hover,
    .resize-handle:active {
      background: var(--vscode-focusBorder, #007acc);
      opacity: 0.5;
    }

    /* Split view layout */
    .split-body {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .split-left {
      width: 280px;
      min-width: 200px;
      flex-shrink: 0;
      overflow-y: auto;
      padding: 12px 12px 20px;
      border-right: 1px solid var(--vscode-panel-border, #ddd);
    }

    .split-right {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px 20px;
    }

    .agent-badges {
      display: flex;
      gap: 4px;
      margin-top: 4px;
      flex-wrap: wrap;
    }

    .agent-badge {
      font-size: 9px;
      padding: 1px 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.08);
      color: var(--vscode-descriptionForeground, #888);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .file-row.active {
      outline: 1px solid currentColor;
      border: 1px solid currentColor;
      box-shadow: 0 0 6px currentColor;
    }

    .panel-header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--vscode-panel-border, #ddd);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--vscode-sideBarSectionHeader-background, #f0f0f0);
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .back-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 16px;
      padding: 4px 6px;
      border-radius: 4px;
      color: var(--vscode-foreground, #333);
      flex-shrink: 0;
    }

    .back-btn:hover {
      background: rgba(0,0,0,0.1);
    }

    .header-info {
      min-width: 0;
    }

    .panel-title {
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-title-link {
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .panel-title-link:hover {
      color: var(--vscode-textLink-foreground, #3794ff);
    }

    .panel-title-link .external-icon {
      width: 11px;
      height: 11px;
      opacity: 0;
      flex-shrink: 0;
      transition: opacity 0.15s;
    }

    .panel-title-link:hover .external-icon {
      opacity: 0.7;
    }

    .panel-subtitle {
      font-size: 11px;
      opacity: 0.6;
      margin-top: 2px;
      font-family: monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
      padding: 4px 8px;
      border-radius: 4px;
      color: var(--vscode-foreground, #333);
      flex-shrink: 0;
    }

    .close-btn:hover {
      background: rgba(0,0,0,0.1);
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px 20px;
    }

    /* --- File list --- */

    .file-group {
      margin-bottom: 20px;
    }

    .group-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      opacity: 0.45;
      margin-bottom: 4px;
      padding: 0 6px;
    }

    .file-item {
      border-radius: 5px;
      overflow: hidden;
      margin-bottom: 4px;
    }

    .file-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 5px;
      transition: filter 0.15s;
      user-select: none;
      background: rgba(255,255,255,0.04);
    }

    .file-row:hover {
      filter: brightness(1.3);
    }

    /* Card colors per group type */
    .file-row[data-group="skills"]   { background: var(--color-skill-bg); color: var(--color-skill); }
    .file-row[data-group="commands"] { background: var(--color-command-bg); color: var(--color-command); }
    .file-row[data-group="agents"]   { background: var(--color-agent-bg); color: var(--color-agent); }
    .file-row[data-group="rules"]    { background: var(--color-rule-bg); color: var(--color-rule); }
    .file-row[data-group="scripts"]  { background: var(--color-script-bg); color: var(--color-script); }
    .file-row[data-group="hooks"]    { background: rgba(20,184,166,0.12); color: #14B8A6; }
    .file-row[data-group="output-styles"] { background: rgba(221,51,250,0.12); color: #DD33FA; }
    .file-row[data-group="claude"]   { background: var(--color-claude-bg); color: var(--color-claude); }
    .file-row[data-group="docs"]     { background: rgba(255,255,255,0.06); }
    .file-row[data-group="other"]    { background: rgba(255,255,255,0.04); }

    .file-name {
      font-size: 12px;
      font-weight: 600;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--vscode-editor-font-family, 'Menlo, Monaco, monospace');
    }

    .symlink-icon {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
      opacity: 0.5;
    }

    .file-row::after {
      content: '→';
      opacity: 0;
      transition: opacity 0.15s;
      font-size: 12px;
      flex-shrink: 0;
    }

    .file-row:hover::after,
    .file-row.active::after {
      opacity: 0.5;
    }

    .empty-state {
      font-size: 12px;
      opacity: 0.5;
      text-align: center;
      padding: 24px 0;
    }

    .open-project-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 6px;
      border: none;
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08));
      color: var(--vscode-foreground, #ccc);
      cursor: pointer;
      margin-top: 12px;
      transition: background 0.15s;
    }

    .open-project-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.15));
    }

    .open-project-btn svg {
      width: 16px;
      height: 16px;
    }

    .forget-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 6px;
      border: none;
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.08));
      color: var(--vscode-errorForeground, #f44);
      cursor: pointer;
      margin-top: 12px;
      margin-left: 8px;
      transition: background 0.15s;
      opacity: 0.7;
    }

    .forget-btn:hover {
      opacity: 1;
      background: rgba(255,68,68,0.12);
    }

    .forget-btn svg {
      width: 16px;
      height: 16px;
    }

    /* --- File detail view --- */

    .file-detail-body .markdown-preview,
    .file-detail-body .code-block {
      max-height: none;
      border-radius: 5px;
    }

    .action-bar {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      flex-wrap: wrap;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--vscode-button-secondaryBackground, #e8e8e8);
      color: var(--vscode-button-secondaryForeground, #333);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .action-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #d6d6d6);
    }

    .action-btn.primary {
      background: var(--vscode-button-background, #007acc);
      color: var(--vscode-button-foreground, #fff);
    }

    .action-btn.primary:hover {
      background: var(--vscode-button-hoverBackground, #005fa3);
    }

    .action-btn.icon-btn {
      padding: 6px 8px;
    }

    .action-btn.icon-btn svg {
      width: 14px;
      height: 14px;
    }

    .action-btn.danger-icon {
      opacity: 0.5;
    }

    .action-btn.danger-icon:hover {
      opacity: 1;
      color: var(--vscode-errorForeground, #f44);
      background: rgba(255,68,68,0.12);
    }

    /* Repo tags */
    .repo-tags-section {
      padding: 10px 16px;
      border-bottom: 1px solid var(--vscode-panel-border, #ddd);
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    .repo-tags-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #888);
      margin-right: 4px;
    }

    .repo-tag {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      background: var(--vscode-badge-background, rgba(128,128,128,0.15));
      color: var(--vscode-badge-foreground, var(--vscode-foreground, #333));
      cursor: pointer;
      transition: background 0.15s;
    }

    .repo-tag:hover {
      background: var(--vscode-list-hoverBackground, #e8e8e8);
      text-decoration: underline;
    }

    /* Actions bar at top */
    .top-action-bar {
      display: flex;
      gap: 6px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--vscode-panel-border, #ddd);
      flex-shrink: 0;
    }

    /* --- Markdown preview --- */

    .frontmatter-accordion {
      margin-bottom: 12px;
      border: 1px solid var(--vscode-panel-border, #ddd);
      border-radius: 5px;
      overflow: hidden;
    }

    .frontmatter-summary {
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      user-select: none;
      background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.08));
    }

    .frontmatter-summary:hover {
      color: var(--vscode-foreground, #ccc);
    }

    .frontmatter-code {
      margin: 0;
      padding: 10px 14px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11.5px;
      line-height: 1.6;
      white-space: pre-wrap;
      color: var(--vscode-descriptionForeground, #999);
      background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.04));
      border-top: 1px solid var(--vscode-panel-border, #ddd);
    }

    .markdown-preview {
      padding: 14px 18px;
      font-size: 13px;
      line-height: 1.75;
      max-height: 480px;
      overflow-y: auto;
      background: var(--vscode-textCodeBlock-background, #f8f8f8);
      border: 1px solid var(--vscode-panel-border, #e0e0e0);
      border-radius: 5px;
      color: var(--vscode-foreground, #333);
    }
    .markdown-preview h1, .markdown-preview h2, .markdown-preview h3,
    .markdown-preview h4, .markdown-preview h5 {
      font-weight: 600;
      line-height: 1.3;
      margin: 16px 0 6px;
    }
    .markdown-preview h1:first-child,
    .markdown-preview h2:first-child { margin-top: 0; }
    .markdown-preview h1 { font-size: 17px; }
    .markdown-preview h2 { font-size: 15px; }
    .markdown-preview h3 { font-size: 13px; }
    .markdown-preview p { margin: 0 0 10px; }
    .markdown-preview p:last-child { margin-bottom: 0; }
    .markdown-preview code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11.5px;
      background: rgba(128,128,128,0.15);
      padding: 1px 5px;
      border-radius: 3px;
    }
    .markdown-preview pre {
      background: rgba(0,0,0,0.08);
      padding: 10px 14px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
    }
    .markdown-preview pre code { background: none; padding: 0; }
    .markdown-preview ul, .markdown-preview ol {
      margin: 4px 0 10px;
      padding-left: 22px;
    }
    .markdown-preview li { margin: 3px 0; }
    .markdown-preview blockquote {
      border-left: 3px solid var(--vscode-activityBar-foreground, #888);
      margin: 8px 0;
      padding: 4px 14px;
      opacity: 0.85;
    }
    .markdown-preview hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border, #ddd);
      margin: 14px 0;
    }
    .markdown-preview a { color: var(--vscode-textLink-foreground, #3794ff); }
    .markdown-preview strong { font-weight: 600; }
    .markdown-preview table {
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 12px;
    }
    .markdown-preview th, .markdown-preview td {
      border: 1px solid var(--vscode-panel-border, #ddd);
      padding: 4px 10px;
    }
    .markdown-preview th { font-weight: 600; background: rgba(128,128,128,0.1); }

    /* --- Code block with syntax highlight + line numbers --- */

    .code-block {
      display: flex;
      overflow: auto;
      max-height: 480px;
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #e0e0e0);
      border-radius: 5px;
      font-family: var(--vscode-editor-font-family, 'Menlo, Monaco, monospace');
      font-size: 12px;
      line-height: 1.65;
    }
    .code-line-nums {
      text-align: right;
      user-select: none;
      padding: 12px 10px 12px 14px;
      color: var(--vscode-editorLineNumber-foreground, #858585);
      border-right: 1px solid rgba(128,128,128,0.15);
      flex-shrink: 0;
      margin: 0;
      white-space: pre;
      font-size: 11.5px;
      opacity: 0.6;
    }
    .code-content {
      padding: 12px 14px;
      flex: 1;
      margin: 0;
      white-space: pre;
      overflow-x: visible;
      color: var(--hljs-default, #d4d4d4);
    }
    .code-content .hljs-keyword,
    .code-content .hljs-selector-tag,
    .code-content .hljs-tag { color: var(--hljs-kw, #569cd6); }
    .code-content .hljs-string,
    .code-content .hljs-template-variable { color: var(--hljs-str, #ce9178); }
    .code-content .hljs-comment,
    .code-content .hljs-quote { color: var(--hljs-cmt, #6a9955); font-style: italic; }
    .code-content .hljs-number,
    .code-content .hljs-literal { color: var(--hljs-num, #b5cea8); }
    .code-content .hljs-title,
    .code-content .hljs-title.function_,
    .code-content .hljs-title.class_ { color: var(--hljs-fn, #dcdcaa); }
    .code-content .hljs-type,
    .code-content .hljs-class { color: var(--hljs-type, #4ec9b0); }
    .code-content .hljs-built_in,
    .code-content .hljs-symbol,
    .code-content .hljs-attr,
    .code-content .hljs-property { color: var(--hljs-builtin, #9cdcfe); }
    .code-content .hljs-regexp { color: var(--hljs-regexp, #d16969); }
    .code-content .hljs-meta,
    .code-content .hljs-name { color: var(--hljs-meta, #569cd6); }

    .standalone-placeholder {
      padding-top: 4px;
    }

    .repo-tag-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  `;

  updated(changed: Map<string, unknown>) {
    if (changed.has('open') && this.open) {
      this._width = Math.max(480, window.innerWidth * 0.6);
    }
    if (changed.has('repo') && this.repo && !this.navigateToFile) {
      this._mode = 'detail';
      this._viewingFile = null;
    }
    if (changed.has('navigateToFile') && this.navigateToFile) {
      this._viewingFile = this.navigateToFile;
      this._mode = 'file-detail';
    }
  }

  render() {
    const panelClasses = ['panel', this.open ? 'open' : '', this._dragging ? 'dragging' : ''].filter(Boolean).join(' ');
    const hasFileNoRepo = this._viewingFile && !this.repo;
    return html`
      <div class="overlay ${this.open ? 'open' : ''}" @click="${this._close}"></div>
      <div class="${panelClasses}" style="width:${this._width}px">
        <div class="resize-handle" @mousedown="${this._onResizeStart}"></div>
        ${hasFileNoRepo
          ? (this._isSplitView ? this._renderStandalonePreviewSplit() : this._renderStandalonePreview())
          : this._isSplitView
            ? this._renderSplitView()
            : this._mode === 'file-detail' ? this._renderFileDetail() : this._renderDetail()}
      </div>
    `;
  }

  private _renderDetail() {
    if (!this.repo) {return nothing;}
    return html`
      <div class="panel-header">
        <div class="header-info">
          <div class="panel-title-link" @click="${this._openProject}" title="Open in new window"><span>${this.repo.name}</span>${iconExternal('external-icon')}</div>
          <div class="panel-subtitle">${this.repo.path}</div>
          ${this.repo.agents && this.repo.agents.length > 0 ? html`
            <div class="agent-badges">${this.repo.agents.map(a => html`<span class="agent-badge">${a}</span>`)}</div>
          ` : ''}
        </div>
        <button class="close-btn" @click="${this._close}" title="Close">✕</button>
      </div>
      <div class="panel-body">
        ${this.claudeMdFiles.map(entry => html`
          <div class="file-item" style="margin-bottom: 16px;">
            <div class="file-row" data-group="claude" @click="${() => this._navigateToFile(entry)}" @contextmenu="${(e: MouseEvent) => this._onFileContextMenu(e, entry)}">
              <span class="file-name">${entry.name}</span>
            </div>
          </div>
        `)}
        ${this.fileGroups.length === 0 && this.claudeMdFiles.length === 0
          ? html`<div class="empty-state">No files found in .claude/</div>`
          : this.fileGroups.map(group => {
            const groupKey = group.label.toLowerCase().replace(/\s+/g, '-');
            return html`
              <div class="file-group">
                <div class="group-label">${group.label} (${group.entries.length})</div>
                ${group.entries.map(entry => html`
                  <div class="file-item">
                    <div class="file-row" data-group="${groupKey}" @click="${() => this._navigateToFile(entry)}" @contextmenu="${(e: MouseEvent) => this._onFileContextMenu(e, entry)}">
                      <span class="file-name">${entry.name}</span>
                      ${this._isSymlink(entry) ? iconLink('symlink-icon') : ''}
                    </div>
                  </div>
                `)}
              </div>
            `;
          })
        }
      </div>
    `;
  }

  private _renderFileDetail() {
    if (!this._viewingFile || !this.repo) {return nothing;}
    return html`
      <div class="panel-header">
        <div class="header-left">
          <button class="back-btn" @click="${this._backToDetail}" title="Back to file list">←</button>
          <div class="header-info">
            <div class="panel-title">${this._viewingFile.name}</div>
            <div class="panel-subtitle">${this.repo.name}</div>
          </div>
        </div>
        <button class="close-btn" @click="${this._close}" title="Close">✕</button>
      </div>
      ${this.assetRepos.length > 0 ? html`
        <div class="repo-tags-section">
          <span class="repo-tags-label">Installed in</span>
          ${this.assetRepos.map(name => html`
            <span class="repo-tag" @click="${() => this._openRepoDetail(name)}">${name}</span>
          `)}
        </div>
      ` : ''}
      <div class="top-action-bar">
        <button class="action-btn primary" @click="${() => this._openAsset(this._viewingFile!.path)}">
          Open in Editor
        </button>
        <button class="action-btn icon-btn" @click="${() => this._copyPath(this._viewingFile!.path)}" title="Copy Path">
          ${iconCopy()}
        </button>
        <button class="action-btn icon-btn danger-icon" @click="${this._deleteViewingFile}" title="Delete">
          ${iconTrash()}
        </button>
      </div>
      <div class="panel-body file-detail-body">
        ${this._viewingFile.preview
          ? this._renderFileContent(this._viewingFile.path, this._viewingFile.preview)
          : html`<div class="empty-state">Loading...</div>`
        }
      </div>
    `;
  }

  private _forgetRepo() {
    if (this.repo) {
      this.dispatchEvent(new CustomEvent('forget-repo', {
        detail: { repoName: this.repo.name },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private _onFileContextMenu(e: MouseEvent, entry: FileEntry) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.repo) return;
    // Find the matching asset from the repo to get full metadata
    const asset = this.repo.assets.find(a => a.name === entry.name || a.path === entry.path);
    const detail = asset ?? { name: entry.name, type: 'command' as const, path: entry.path, isDirectory: false, hash: '', repoName: this.repo.name };
    this.dispatchEvent(new CustomEvent('show-context-menu', {
      detail: { x: e.clientX, y: e.clientY, asset: detail },
      bubbles: true,
      composed: true,
    }));
  }

  private _deleteViewingFile() {
    if (!this._viewingFile) return;
    const viewPath = this._viewingFile.path;
    if (this.repo) {
      // Match by name, exact path, or SKILL.md inside directory asset
      const asset = this.repo.assets.find(a =>
        a.name === this._viewingFile!.name || a.path === viewPath || viewPath.startsWith(a.path + '/'),
      );
      const fallbackPath = viewPath.endsWith('/SKILL.md') ? viewPath.slice(0, -'/SKILL.md'.length) : viewPath;
      const detail = asset ?? { name: this._viewingFile.name, type: 'skill' as const, path: fallbackPath, isDirectory: viewPath.endsWith('/SKILL.md'), hash: '', repoName: this.repo.name };
      this.dispatchEvent(new CustomEvent('delete-file', {
        detail: { path: detail.path, repoName: this.repo.name },
        bubbles: true,
        composed: true,
      }));
    } else {
      // Standalone preview (no repo selected) — strip /SKILL.md to get directory path
      const assetPath = viewPath.endsWith('/SKILL.md') ? viewPath.slice(0, -'/SKILL.md'.length) : viewPath;
      this.dispatchEvent(new CustomEvent('delete-file', {
        detail: { path: assetPath, repoName: '' },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private _openRepoDetail(repoName: string) {
    this.dispatchEvent(new CustomEvent('open-detail', {
      detail: { repoName },
      bubbles: true,
      composed: true,
    }));
  }

  // --- Standalone preview (no repo selected) ---

  private _renderStandalonePreview() {
    if (!this._viewingFile) return nothing;
    return html`
      <div class="panel-header">
        <div class="header-info">
          <div class="panel-title">${this._viewingFile.name}</div>
        </div>
        <button class="close-btn" @click="${this._close}" title="Close">✕</button>
      </div>
      ${this.assetRepos.length > 0 ? html`
        <div class="repo-tags-section">
          <span class="repo-tags-label">Installed in</span>
          ${this.assetRepos.map(name => html`
            <span class="repo-tag" @click="${() => this._openRepoDetail(name)}">${name}</span>
          `)}
        </div>
      ` : ''}
      <div class="top-action-bar">
        <button class="action-btn primary" @click="${() => this._openAsset(this._viewingFile!.path)}">
          Open in Editor
        </button>
        <button class="action-btn icon-btn" @click="${() => this._copyPath(this._viewingFile!.path)}" title="Copy Path">
          ${iconCopy()}
        </button>
      </div>
      <div class="panel-body file-detail-body">
        ${this._viewingFile.preview
          ? this._renderFileContent(this._viewingFile.path, this._viewingFile.preview)
          : html`<div class="empty-state">Loading...</div>`
        }
      </div>
    `;
  }

  private _renderStandalonePreviewSplit() {
    if (!this._viewingFile) return nothing;
    return html`
      <div class="panel-header">
        <div class="header-info">
          <div class="panel-title">${this._viewingFile.name}</div>
        </div>
        <button class="close-btn" @click="${this._close}" title="Close">✕</button>
      </div>
      <div class="split-body">
        <div class="split-left">
          <div class="standalone-placeholder">
            ${this.assetRepos.length > 0 ? html`
              <div class="group-label">Installed in</div>
              <div class="repo-tag-list">
                ${this.assetRepos.map(name => html`
                  <div class="file-row" @click="${() => this._openRepoDetail(name)}">
                    <span class="file-name">${name}</span>
                  </div>
                `)}
              </div>
            ` : html`<div class="empty-state">No repositories</div>`}
          </div>
        </div>
        <div class="split-right">
          ${this._renderFilePreviewContent()}
        </div>
      </div>
    `;
  }

  // --- Split view ---

  private _renderSplitView() {
    if (!this.repo) return nothing;
    return html`
      <div class="panel-header">
        <div class="header-info">
          <div class="panel-title-link" @click="${this._openProject}" title="Open in new window"><span>${this.repo.name}</span>${iconExternal('external-icon')}</div>
          <div class="panel-subtitle">${this.repo.path}</div>
          ${this.repo.agents && this.repo.agents.length > 0 ? html`
            <div class="agent-badges">${this.repo.agents.map(a => html`<span class="agent-badge">${a}</span>`)}</div>
          ` : ''}
        </div>
        <button class="close-btn" @click="${this._close}" title="Close">✕</button>
      </div>
      <div class="split-body">
        <div class="split-left">
          ${this._renderFileListContent()}
        </div>
        <div class="split-right">
          ${this._viewingFile
            ? this._renderFilePreviewContent()
            : html`<div class="empty-state">Select a file to preview</div>`}
        </div>
      </div>
    `;
  }

  /** File list content — reused by both single-column detail and split-view left pane */
  private _renderFileListContent() {
    return html`
      ${this.claudeMdFiles.map(entry => html`
        <div class="file-item" style="margin-bottom: 8px;">
          <div class="file-row ${this._viewingFile?.name === entry.name ? 'active' : ''}" data-group="claude" @click="${() => this._navigateToFile(entry)}" @contextmenu="${(e: MouseEvent) => this._onFileContextMenu(e, entry)}">
            <span class="file-name">${entry.name}</span>
          </div>
        </div>
      `)}
      ${this.fileGroups.length === 0 && this.claudeMdFiles.length === 0
        ? html`<div class="empty-state">No files found in .claude/</div>`
        : this.fileGroups.map(group => {
          const groupKey = group.label.toLowerCase().replace(/\s+/g, '-');
          return html`
            <div class="file-group">
              <div class="group-label">${group.label} (${group.entries.length})</div>
              ${group.entries.map(entry => html`
                <div class="file-item">
                  <div class="file-row ${this._viewingFile?.name === entry.name ? 'active' : ''}" data-group="${groupKey}" @click="${() => this._navigateToFile(entry)}" @contextmenu="${(e: MouseEvent) => this._onFileContextMenu(e, entry)}">
                    <span class="file-name">${entry.name}</span>
                    ${this._isSymlink(entry) ? iconLink('symlink-icon') : ''}
                  </div>
                </div>
              `)}
            </div>
          `;
        })
      }
    `;
  }

  /** File preview content — reused by both single-column file-detail and split-view right pane */
  private _renderFilePreviewContent() {
    if (!this._viewingFile) return nothing;
    return html`
      ${this.assetRepos.length > 0 ? html`
        <div class="repo-tags-section" style="padding:0 0 10px;border-bottom:1px solid var(--vscode-panel-border,#ddd);margin-bottom:10px">
          <span class="repo-tags-label">Installed in</span>
          ${this.assetRepos.map(name => html`
            <span class="repo-tag" @click="${() => this._openRepoDetail(name)}">${name}</span>
          `)}
        </div>
      ` : ''}
      <div class="top-action-bar" style="padding:0 0 10px;border:none">
        <button class="action-btn primary" @click="${() => this._openAsset(this._viewingFile!.path)}">
          Open in Editor
        </button>
        <button class="action-btn icon-btn" @click="${() => this._copyPath(this._viewingFile!.path)}" title="Copy Path">
          ${iconCopy()}
        </button>
        <button class="action-btn icon-btn danger-icon" @click="${this._deleteViewingFile}" title="Delete">
          ${iconTrash()}
        </button>
      </div>
      <div class="file-detail-body">
        ${this._viewingFile.preview
          ? this._renderFileContent(this._viewingFile.path, this._viewingFile.preview)
          : html`<div class="empty-state">Loading...</div>`}
      </div>
    `;
  }

  // --- Resize ---

  private _onResizeStart(e: MouseEvent) {
    e.preventDefault();
    this._dragging = true;

    const onMove = (ev: MouseEvent) => {
      const newWidth = window.innerWidth - ev.clientX;
      this._width = Math.max(480, Math.min(window.innerWidth * 0.95, newWidth));
    };

    const onUp = () => {
      this._dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  private _onWindowResize = () => {
    const max = window.innerWidth * 0.95;
    if (this._width > max) this._width = max;
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('resize', this._onWindowResize);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('resize', this._onWindowResize);
  }

  // --- Rich content rendering ---

  private _renderFileContent(filePath: string, preview: string) {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'md') {
      // Split frontmatter from content
      let frontmatter = '';
      let body = preview;
      if (preview.startsWith('---')) {
        const endIdx = preview.indexOf('---', 3);
        if (endIdx !== -1) {
          frontmatter = preview.slice(3, endIdx).trim();
          body = preview.slice(endIdx + 3).trim();
        }
      }

      const renderedHtml = marked.parse(body) as string;
      return html`
        ${frontmatter ? html`
          <details class="frontmatter-accordion">
            <summary class="frontmatter-summary">Frontmatter</summary>
            <pre class="frontmatter-code">${frontmatter}</pre>
          </details>
        ` : ''}
        <div class="markdown-preview">${unsafeHTML(renderedHtml)}</div>
      `;
    }

    let highlighted: string;
    try {
      if (ext === 'js') {
        highlighted = hljs.highlight(preview, { language: 'javascript' }).value;
      } else if (ext === 'json') {
        highlighted = hljs.highlight(preview, { language: 'json' }).value;
      } else {
        highlighted = this._escapeHtml(preview);
      }
    } catch {
      highlighted = this._escapeHtml(preview);
    }

    const lineCount = preview.trimEnd().split('\n').length;
    const lineNums = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');

    return html`
      <div class="code-block">
        <pre class="code-line-nums" aria-hidden="true">${lineNums}</pre>
        <pre class="code-content"><code>${unsafeHTML(highlighted)}</code></pre>
      </div>
    `;
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Check if a file entry corresponds to a symlinked asset */
  private _isSymlink(entry: FileEntry): boolean {
    if (!this.repo) return false;
    return this.repo.assets.some(a => a.isSymlink && (a.path === entry.path || entry.path.startsWith(a.path + '/')));
  }

  // --- Navigation ---

  private _navigateToFile(entry: FileEntry) {
    this._viewingFile = entry;
    this._mode = 'file-detail';
    this.dispatchEvent(new CustomEvent('file-navigate', {
      detail: { fileName: entry.name, filePath: entry.path },
      bubbles: true,
      composed: true,
    }));
  }

  private _backToDetail() {
    this._viewingFile = null;
    this._mode = 'detail';
  }

  private _close() {
    this.open = false;
    this._mode = 'detail';
    this._viewingFile = null;
    this.dispatchEvent(new CustomEvent('panel-close', { bubbles: true, composed: true }));
  }

  private async _copyPath(filePath: string) {
    // Strip /SKILL.md suffix — copy the directory path, not the internal file
    const copyValue = filePath.endsWith('/SKILL.md') ? filePath.slice(0, -'/SKILL.md'.length) : filePath;
    try {
      await navigator.clipboard.writeText(copyValue);
    } catch {
      // Fallback: select from a temp input
      const input = document.createElement('input');
      input.value = copyValue;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
  }

  private _openAsset(path: string) {
    this.dispatchEvent(new CustomEvent('open-file', {
      detail: { path },
      bubbles: true,
      composed: true,
    }));
  }

  private _openProject() {
    if (this.repo) {
      this.dispatchEvent(new CustomEvent('open-project', {
        detail: { repoPath: this.repo.path },
        bubbles: true,
        composed: true,
      }));
    }
  }
}
