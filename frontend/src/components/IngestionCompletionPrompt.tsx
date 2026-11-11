import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, LoaderCircle, X } from 'lucide-react';
import {
  fetchIngestionStatus,
  fetchPipelineStatus,
  startPipeline,
  type IngestionStatus,
  type PipelineStatus,
} from '../services/pipeline';

type PromptState = {
  key: string;
  kind: 'new-data' | 'no-update' | 'generating' | 'generated' | 'failed';
  title: string;
  message: string;
  detail?: string;
  files?: string[];
  jobId?: string;
};

const SEEN_NOTICE_KEY = 'terraignis-ingestion-notice-seen';

function buildPrompt(status: IngestionStatus): PromptState | null {
  const nrt = status.nrt;
  if (nrt.pending_generation && nrt.run_id) {
    const files = Object.entries(nrt.sources ?? {})
      .filter(([, source]) => source.raw_file_saved)
      .map(([source, result]) => `${source} · ${result.date_start ?? 'recent'}${result.date_end ? ` – ${result.date_end}` : ''}`);
    return {
      key: `nrt:${nrt.run_id}`,
      kind: 'new-data',
      title: 'New FIRMS data is ready',
      message: 'The NRT download finished. Generate the dashboard datasets now to include the new files?',
      detail: `${(nrt.raw_files_added ?? 0).toLocaleString()} new files · ${(nrt.downloaded_records ?? 0).toLocaleString()} downloaded records`,
      files,
    };
  }

  const historical = status.historical.active_job;
  if (historical?.download_notice_pending) {
    const key = `historical:${historical.job_id}:${historical.status}:${historical.completed_chunks}:${historical.updated_at ?? ''}`;
    const hasData = Boolean(historical.pending_generation);
    const interrupted = historical.status === 'cancelled' || historical.status === 'partial_failure';
    const files = historical.chunks
      .filter((chunk) => chunk.status === 'completed' && chunk.raw_file_added)
      .map((chunk) => chunk.raw_file?.split(/[\\/]/).pop() ?? `${chunk.source} · ${chunk.start_date} – ${chunk.end_date}`);
    return {
      key,
      kind: hasData ? 'new-data' : 'no-update',
      title: hasData
        ? (interrupted ? 'Historical download paused' : 'Historical download complete')
        : interrupted ? 'No new historical files downloaded' : 'No historical update',
      message: hasData
        ? interrupted
          ? 'You can generate datasets from the chunks downloaded so far, or resume the remaining download later.'
          : 'The historical download finished. Generate the dashboard datasets to include these files?'
        : interrupted
          ? 'The download paused before adding any new files. Resume it later; there is no new data to generate yet.'
          : 'NASA FIRMS returned no new raw files for this request, so there is nothing to regenerate.',
      detail: `${(historical.raw_files_added ?? files.length).toLocaleString()} new files · ${historical.downloaded_records.toLocaleString()} downloaded records · ${historical.completed_chunks.toLocaleString()} of ${historical.total_chunks.toLocaleString()} chunks`,
      files,
    };
  }

  if (
    nrt.manual_run &&
    nrt.download_notice_pending &&
    nrt.status === 'succeeded' &&
    !nrt.pending_generation &&
    nrt.run_id
  ) {
    return {
      key: `nrt-no-update:${nrt.run_id}`,
      kind: 'no-update',
      title: 'NRT poll complete · no update',
      message: 'NASA FIRMS returned no new raw files. Your current dashboard datasets are already up to date.',
      detail: `${(nrt.downloaded_records ?? 0).toLocaleString()} records checked`,
    };
  }

  return null;
}

export default function IngestionCompletionPrompt({ theme }: { theme: 'light' | 'dark' }) {
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshIngestion = useCallback(async () => {
    try {
      const status = await fetchIngestionStatus();
      const nextPrompt = buildPrompt(status);
      if (!nextPrompt) return;

      if (nextPrompt.kind === 'no-update' && localStorage.getItem(SEEN_NOTICE_KEY) === nextPrompt.key) return;
      setPrompt((current) => {
        if (current?.kind === 'generating' || current?.kind === 'generated' || current?.kind === 'failed') return current;
        if (dismissedKey === nextPrompt.key) return null;
        return nextPrompt;
      });
    } catch {
      // The ingestion status is also shown on the pipeline page; keep other routes usable offline.
    }
  }, [dismissedKey]);

  useEffect(() => {
    void refreshIngestion();
    const timer = window.setInterval(() => void refreshIngestion(), 2000);
    return () => window.clearInterval(timer);
  }, [refreshIngestion]);

  useEffect(() => {
    if (prompt?.kind !== 'generating' || !prompt.jobId) return;
    let active = true;
    const check = async () => {
      try {
        const status: PipelineStatus = await fetchPipelineStatus();
        if (!active || status.job_id !== prompt.jobId) return;
        if (status.status === 'queued' || status.status === 'running') {
          const message = status.message || 'Rebuilding processed datasets from all available raw FIRMS files.';
          const detail = status.stage ? `Current step: ${status.stage}` : prompt.detail;
          if (message !== prompt.message || detail !== prompt.detail) setPrompt({ ...prompt, message, detail });
          return;
        }
        if (status.status === 'succeeded') {
          setPrompt({ ...prompt, kind: 'generated', title: 'Datasets regenerated', message: 'The latest downloaded FIRMS data is now included in the dashboard.' });
        } else if (status.status === 'failed') {
          setPrompt({ ...prompt, kind: 'failed', title: 'Dataset generation failed', message: status.message || 'The previous processed dataset remains active.' });
        }
      } catch {
        // Keep the progress dialog open and retry on the next poll.
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [prompt]);

  useEffect(() => {
    if (prompt?.kind !== 'generated') return;
    const timer = window.setTimeout(() => {
      setDismissedKey(prompt.key);
      setPrompt(null);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [prompt]);

  const dismiss = () => {
    if (!prompt) return;
    if (prompt.kind === 'no-update') localStorage.setItem(SEEN_NOTICE_KEY, prompt.key);
    setDismissedKey(prompt.key);
    setPrompt(null);
    setActionError(null);
  };

  const generate = async () => {
    if (!prompt) return;
    setActionError(null);
    try {
      const result = await startPipeline();
      setPrompt({ ...prompt, kind: 'generating', title: 'Generating dashboard datasets', message: 'Rebuilding processed datasets from all available raw FIRMS files.', jobId: result.job_id });
    } catch (error) {
      try {
        const status = await fetchPipelineStatus();
        if (status.job_id && (status.status === 'queued' || status.status === 'running')) {
          setPrompt({ ...prompt, kind: 'generating', title: 'Dataset generation in progress', message: 'A dataset generation job is already running.', jobId: status.job_id });
          return;
        }
      } catch {
        // Show the original start error below.
      }
      setActionError(error instanceof Error ? error.message : 'Could not start dataset generation.');
    }
  };

  if (!prompt) return null;
  const isFloatingState = prompt.kind === 'generating' || prompt.kind === 'generated' || prompt.kind === 'failed';

  const icon = prompt.kind === 'generating'
    ? <LoaderCircle className="animate-spin text-indigo-500" size={21} />
    : prompt.kind === 'generated'
      ? <CheckCircle2 className="text-emerald-500" size={21} />
      : prompt.kind === 'failed'
        ? <AlertTriangle className="text-rose-500" size={21} />
        : prompt.kind === 'no-update'
          ? <CheckCircle2 className="text-slate-500" size={21} />
          : <Database className="text-indigo-500" size={21} />;

  return (
    <div
      className={isFloatingState
        ? 'ingestion-modal-theme pointer-events-none fixed right-4 top-20 z-[100] w-[min(24rem,calc(100vw-2rem))]'
        : 'ingestion-modal-theme fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md'}
      data-theme={theme}
      style={isFloatingState ? undefined : { backgroundColor: theme === 'dark' ? 'rgba(2, 6, 23, 0.24)' : 'rgba(226, 232, 240, 0.28)' }}
      role={isFloatingState ? 'region' : 'presentation'}
      aria-label={isFloatingState ? 'Dataset generation status' : undefined}
      aria-live={isFloatingState ? 'polite' : undefined}
    >
      <section
        role={isFloatingState ? 'region' : 'dialog'}
        aria-modal={isFloatingState ? undefined : true}
        aria-labelledby="ingestion-prompt-title"
        className={`glass-panel-strong pointer-events-auto flex max-h-[min(90dvh,44rem)] w-full flex-col overflow-hidden rounded-2xl p-5 shadow-2xl sm:p-6 ${isFloatingState ? 'max-w-sm' : 'max-w-lg sm:p-6'}`}
      >
        <div className="flex min-h-0 flex-1 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/10">{icon}</div>
          <div className="min-w-0 flex-1 overflow-y-auto pr-1">
            <h2 id="ingestion-prompt-title" className="text-base font-semibold glass-heading">{prompt.title}</h2>
            <p className="mt-1 text-sm glass-muted">{prompt.message}</p>
            {prompt.detail && <p className="mt-3 rounded-lg bg-slate-500/10 px-3 py-2 text-xs glass-muted tabular-nums">{prompt.detail}</p>}
            {Boolean(prompt.files?.length) && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium glass-muted">Downloaded files ({prompt.files!.length.toLocaleString()})</p>
                <ul className="ingestion-file-list max-h-32 space-y-1 overflow-y-auto rounded-lg p-2 text-xs glass-muted" aria-label="Downloaded files">
                  {prompt.files!.map((file, index) => <li key={`${file}-${index}`} className="truncate" title={file}>{file}</li>)}
                </ul>
              </div>
            )}
            {prompt.kind === 'failed' && <p className="mt-2 text-xs tone-rose">{actionError}</p>}
            {actionError && prompt.kind !== 'failed' && <p role="alert" className="mt-3 text-xs tone-rose">{actionError}</p>}
            {prompt.kind === 'generating' && <p className="mt-3 text-xs glass-muted">This may take several minutes. You can continue using the dashboard while it runs.</p>}
          </div>
          {(prompt.kind === 'new-data' || prompt.kind === 'no-update' || isFloatingState) && (
            <button type="button" onClick={dismiss} aria-label={isFloatingState ? 'Hide generation status' : 'Close notification'} className="glass-icon-btn rounded-full p-1.5">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="mt-5 flex shrink-0 justify-end gap-2">
          {(prompt.kind === 'new-data' || prompt.kind === 'failed') && (
            <>
              <button type="button" onClick={dismiss} className="glass-btn rounded-lg px-4 py-2 text-sm font-medium">
                Later
              </button>
              <button type="button" onClick={() => void generate()} className="glass-btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold">
                {prompt.kind === 'failed' ? 'Retry generation' : 'Generate datasets'}
              </button>
            </>
          )}
          {(prompt.kind === 'no-update' || prompt.kind === 'generated') && (
            <button type="button" onClick={dismiss} className="glass-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
              {prompt.kind === 'generated' ? 'Done' : 'Got it'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
