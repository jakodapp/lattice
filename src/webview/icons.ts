import { html } from 'lit';
import type { TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import {
  Download,
  RefreshCw,
  Trash2,
  TriangleAlert,
  ChevronRight,
  Link,
  Copy,
  GitCompare,
  Link2,
  ExternalLink,
  Replace,
  FolderOpen,
} from 'lucide-static';

function lucide(svgString: string, className?: string): TemplateResult {
  let s = svgString
    .replace(/ width="\d+"/, '')
    .replace(/ height="\d+"/, '');
  if (className) {
    s = s.replace('class="lucide', `class="${className} lucide`);
  }
  return html`${unsafeHTML(s)}`;
}

export const iconDownload = (cls?: string) => lucide(Download, cls);
export const iconRefresh = (cls?: string) => lucide(RefreshCw, cls);
export const iconTrash = (cls?: string) => lucide(Trash2, cls);
export const iconWarning = (cls?: string) => lucide(TriangleAlert, cls);
export const iconChevron = (cls?: string) => lucide(ChevronRight, cls);
export const iconLink = (cls?: string) => lucide(Link, cls);
export const iconCopy = (cls?: string) => lucide(Copy, cls);
export const iconDiff = (cls?: string) => lucide(GitCompare, cls);
export const iconConvertLink = (cls?: string) => lucide(Link2, cls);
export const iconExternal = (cls?: string) => lucide(ExternalLink, cls);
export const iconReplace = (cls?: string) => lucide(Replace, cls);
export const iconFolderOpen = (cls?: string) => lucide(FolderOpen, cls);
