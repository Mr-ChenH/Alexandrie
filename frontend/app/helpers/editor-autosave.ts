export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'local' | 'error';

export interface AutosaveOptions<T, R> {
  snapshot: () => T;
  persist: (snapshot: T) => Promise<R>;
  isLocal: (result: R) => boolean;
  onResult?: (result: R, current: boolean) => void;
  onStatus: (status: SaveStatus) => void;
  onError?: (error: unknown) => void;
  enabled: () => boolean;
  canPersist?: () => boolean;
  delay?: number;
  maxWait?: number;
}

/** A single write at a time; edits during a request become the next snapshot. */
export function createAutosave<T, R>(options: AutosaveOptions<T, R>) {
  let revision = 0;
  let savedRevision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<boolean> | undefined;
  let disposed = false;

  const cancelTimers = () => {
    clearTimeout(timer);
    clearTimeout(deadline);
    timer = deadline = undefined;
  };

  async function flush(): Promise<boolean> {
    cancelTimers();
    if (disposed || options.canPersist?.() === false) return false;
    if (pending) {
      const success = await pending;
      return success && revision > savedRevision ? flush() : success;
    }
    if (revision === savedRevision) return true;
    const version = revision;
    const data = options.snapshot();
    options.onStatus('saving');
    pending = (async () => {
      try {
        const result = await options.persist(data);
        savedRevision = version;
        if (!disposed) {
          options.onResult?.(result, revision === version);
          options.onStatus(revision > version ? 'dirty' : options.isLocal(result) ? 'local' : 'saved');
        }
        return true;
      } catch (error) {
        if (!disposed) {
          options.onStatus('error');
          options.onError?.(error);
        }
        return false;
      } finally {
        pending = undefined;
      }
    })();
    const success = await pending;
    return success && !disposed && revision > savedRevision ? flush() : success;
  }

  function schedule() {
    if (disposed || !options.enabled()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, options.delay ?? 700);
    deadline ??= setTimeout(() => { void flush(); }, options.maxWait ?? 5000);
  }

  return {
    change() {
      if (disposed) return;
      revision++;
      if (!pending) options.onStatus('dirty');
      schedule();
    },
    flush,
    schedule,
    cancelTimers,
    get dirty() { return revision > savedRevision; },
    dispose() {
      disposed = true;
      cancelTimers();
    },
  };
}
