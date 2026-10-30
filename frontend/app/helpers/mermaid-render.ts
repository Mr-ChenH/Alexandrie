export interface RenderMermaidOptions {
  dark: boolean;
}

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(m => m.default);
  return mermaidPromise;
}

// Preview updates and PDF rendering share Mermaid's global state. Serialize
// entire batches, including initialize(), rather than only diagrams in one batch.
let renderQueue: Promise<void> = Promise.resolve();
export function renderMermaidDiagrams(root: HTMLElement, options: RenderMermaidOptions): Promise<void> {
  const next = renderQueue.catch(() => undefined).then(() => renderBatch(root, options));
  renderQueue = next;
  return next;
}

async function renderBatch(root: HTMLElement, options: RenderMermaidOptions): Promise<void> {
  const elements = Array.from(root.querySelectorAll<HTMLElement>('pre.mermaid'));
  if (!elements.length) return;

  const mermaid = await loadMermaid();
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: options.dark ? 'dark' : 'default' });

  for (const el of elements) {
    if (!root.contains(el)) continue;
    const source = el.dataset.mermaidSource ?? el.textContent ?? '';
    el.dataset.mermaidSource ??= source;

    try {
      const trimmed = source.trim();
      // Validate before rendering: mermaid.render() leaves an orphaned DOM node behind
      // (appended to document.body) when it fails on invalid syntax, since it never
      // reaches its own cleanup step. parse() throws on invalid input without that side effect.
      await mermaid.parse(trimmed);

      const { svg } = await mermaid.render(`mermaid-${crypto.randomUUID()}`, trimmed);
      el.innerHTML = svg;
      el.classList.remove('mermaid-error');
    } catch (err) {
      el.classList.add('mermaid-error');
      el.textContent = `Diagram error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
