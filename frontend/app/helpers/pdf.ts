import type { Node } from '~/stores';
import { paginatePdf, pdfFilename, type PdfRange } from './pdf-layout';
import compile from './markdown';
import { renderMermaidDiagrams } from './mermaid-render';
import exportStyles from '~/styles/features/pdf-export.css?inline';

export interface PdfOptions {
  format: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  includeDescription: boolean;
  theme: string;
  missingImageLabel: string;
  resolveNode?: (id: string) => string | undefined;
  signal?: AbortSignal;
  onProgress?: (page: number, total: number) => void;
}

export interface DocumentPdf {
  file: File;
  pages: number;
  missingImages: number;
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('PDF export cancelled', 'AbortError');
}

async function bounded<T>(promise: Promise<T>, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PDF asset loading timed out')), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

async function copyStyles(target: Document) {
  const pending: Promise<void>[] = [];
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(source => {
    const clone = source.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
    if (clone instanceof HTMLLinkElement) {
      pending.push(new Promise<void>((resolve, reject) => {
        clone.onload = () => resolve();
        clone.onerror = () => reject(new Error('Could not load PDF stylesheet'));
      }));
    }
    target.head.appendChild(clone);
  });
  await bounded(Promise.all(pending));
  const style = target.createElement('style');
  style.textContent = exportStyles;
  target.head.appendChild(style);
}

async function prepareImages(root: HTMLElement, label: string): Promise<number> {
  // Draw.io uses object elements for SVG previews; render those as inert images.
  root.querySelectorAll<HTMLObjectElement>('object[type="image/svg+xml"]').forEach(object => {
    const image = root.ownerDocument.createElement('img');
    image.src = object.data;
    image.alt = object.getAttribute('aria-label') || '';
    object.replaceWith(image);
  });
  let missing = 0;
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async image => {
    const src = image.src;
    image.removeAttribute('srcset');
    image.loading = 'eager';
    image.crossOrigin = 'anonymous';
    image.src = src;
    try {
      await bounded(image.decode());
    } catch {
      missing++;
      const placeholder = root.ownerDocument.createElement('p');
      placeholder.className = 'pdf-missing-image';
      placeholder.textContent = image.alt ? `${label}: ${image.alt}` : label;
      image.replaceWith(placeholder);
    }
  }));
  return missing;
}

function collectRanges(root: HTMLElement, pageHeight: number): PdfRange[] {
  const offset = root.getBoundingClientRect().top;
  const ranges: PdfRange[] = [];
  // Whole blocks stay together if reasonably sized; long blocks can split at text lines.
  root.querySelectorAll('p, li, pre, blockquote, tr, img, svg').forEach(element => {
    const rect = element.getBoundingClientRect();
    if (rect.height < pageHeight * 0.75) ranges.push({ top: rect.top - offset, bottom: rect.bottom - offset });
  });
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent?.trim()) continue;
    if (walker.currentNode.parentElement?.closest('svg, style')) continue;
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) ranges.push({ top: rect.top - offset, bottom: rect.bottom - offset });
  }
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    const rect = heading.getBoundingClientRect();
    const next = heading.nextElementSibling?.getBoundingClientRect();
    ranges.push({ top: rect.top - offset, bottom: Math.max(rect.bottom, next ? next.top + Math.min(next.height, 28) : rect.bottom) - offset });
  });
  return ranges;
}

/** Render one page at a time so long notes never require a document-sized canvas. */
export async function createDocumentPdf(node: Node, options: PdfOptions): Promise<DocumentPdf> {
  checkAborted(options.signal);
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas-pro')]);
  checkAborted(options.signal);
  const pdf = new jsPDF({ orientation: options.orientation, format: options.format, unit: 'mm', compress: true });
  pdf.setProperties({ title: node.name, subject: node.description || '', creator: 'Alexandrie' });
  const margin = 14;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const height = pdf.internal.pageSize.getHeight() - margin * 2 - 7;
  const pxPerMm = 96 / 25.4;
  const pageWidth = Math.floor(width * pxPerMm);
  const pageHeight = Math.floor(height * pxPerMm);
  const frame = document.createElement('iframe');
  frame.title = 'PDF export';
  frame.setAttribute('aria-hidden', 'true');
  frame.sandbox.add('allow-same-origin');
  Object.assign(frame.style, { position: 'fixed', left: '0', top: '0', width: `${pageWidth}px`, height: `${pageHeight}px`, opacity: '0', pointerEvents: 'none', zIndex: '-1', border: '0' });
  document.body.appendChild(frame);
  try {
    const target = frame.contentDocument;
    if (!target) throw new Error('Could not create PDF document');
    const base = target.createElement('base');
    base.href = document.baseURI;
    target.head.appendChild(base);
    target.documentElement.lang = document.documentElement.lang;
    target.documentElement.className = 'light-mode';
    await copyStyles(target);
    checkAborted(options.signal);
    const root = target.createElement('main');
    root.className = 'pdf-document';
    root.style.setProperty('--pdf-page-height', `${pageHeight}px`);
    const title = target.createElement('h1');
    title.className = 'pdf-title';
    title.textContent = node.name;
    root.appendChild(title);
    if (options.includeDescription && node.description) {
      const description = target.createElement('p');
      description.className = 'pdf-description';
      description.textContent = node.description;
      root.appendChild(description);
    }
    const article = target.createElement('article');
    article.className = `markdown-preview document-content ${options.theme}-theme`;
    article.innerHTML = node.content != null ? compile(node.content, options.resolveNode) : node.content_compiled || '';
    article.querySelectorAll('script, iframe, embed, button, .no-print, .header-anchor, audio, video').forEach(element => element.remove());
    article.querySelectorAll('details').forEach(details => { details.open = true; });
    root.appendChild(article);
    target.body.appendChild(root);
    await renderMermaidDiagrams(article, { dark: false });
    const missingImages = await prepareImages(root, options.missingImageLabel);
    // External fonts can be unavailable offline; the frame has local CJK/system fallbacks.
    await bounded(target.fonts.ready, 5000).catch(() => undefined);
    checkAborted(options.signal);
    const pages = paginatePdf(Math.ceil(root.getBoundingClientRect().height), pageHeight, collectRanges(root, pageHeight));
    for (const [index, page] of pages.entries()) {
      checkAborted(options.signal);
      options.onProgress?.(index + 1, pages.length);
      const canvas = await html2canvas(root, {
        y: page.top,
        width: pageWidth,
        height: Math.ceil(page.bottom - page.top),
        windowWidth: pageWidth,
        windowHeight: pageHeight,
        scrollX: 0,
        scrollY: 0,
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: false,
        logging: false,
      });
      checkAborted(options.signal);
      if (index) pdf.addPage();
      pdf.addImage(canvas, 'PNG', margin, margin, width, canvas.height / canvas.width * width, undefined, 'FAST');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(112, 108, 122);
      pdf.text(`${index + 1} / ${pages.length}`, pdf.internal.pageSize.getWidth() / 2, pdf.internal.pageSize.getHeight() - 9, { align: 'center' });
      canvas.width = 0;
      canvas.height = 0;
    }
    return { file: new File([pdf.output('blob')], pdfFilename(node.name), { type: 'application/pdf' }), pages: pages.length, missingImages };
  } finally {
    frame.remove();
  }
}
