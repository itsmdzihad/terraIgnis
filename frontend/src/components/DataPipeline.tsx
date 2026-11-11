import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Play,
  Radio,
  RotateCw,
  RefreshCw,
  XCircle,
  X,
  UploadCloud,
} from 'lucide-react';
import {
  fetchPipelineStatus,
  fetchIngestionStatus,
  startNrtIngestion,
  startHistoricalIngestion,
  resumeHistoricalIngestion,
  cancelHistoricalIngestion,
  startPipeline,
  uploadRawFiles,
  type BatchUploadResult,
  type IngestionStatus,
  type PipelineStatus,
} from '../services/pipeline';

const HISTORICAL_PRODUCTS = ['MODIS_SP', 'VIIRS_SNPP_SP', 'VIIRS_NOAA20_SP', 'VIIRS_NOAA21_SP'];

function formatTimestamp(value?: string | null): string {
  if (!value) return 'Not yet run';
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stageIcon(stageStatus: string) {
  if (stageStatus === 'succeeded') return <CheckCircle2 size={17} className="text-emerald-500" />;
  if (stageStatus === 'running') return <LoaderCircle size={17} className="animate-spin text-blue-600 dark:text-blue-400" />;
  if (stageStatus === 'failed') return <AlertTriangle size={17} className="text-rose-500" />;
  return <Clock3 size={17} className="text-slate-400" />;
}

export default function DataPipeline() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [ingestion, setIngestion] = useState<IngestionStatus | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedSensor, setSelectedSensor] = useState<'MODIS' | 'VIIRS' | ''>('');
  const [uploadResult, setUploadResult] = useState<BatchUploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ingestionError, setIngestionError] = useState<string | null>(null);
  const [ingestionNotice, setIngestionNotice] = useState<string | null>(null);
  const [operatorToken, setOperatorToken] = useState('');
  const [historicalStart, setHistoricalStart] = useState('');
  const [historicalEnd, setHistoricalEnd] = useState('');
  const [historicalArea, setHistoricalArea] = useState('world');
  const [historicalSources, setHistoricalSources] = useState<string[]>(['MODIS_SP', 'VIIRS_SNPP_SP', 'VIIRS_NOAA20_SP', 'VIIRS_NOAA21_SP']);
  const [historicalBusy, setHistoricalBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const nrtNoticePendingRef = useRef(false);
  const nrtNoticeBaselineRef = useRef<string | null>(null);

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const nextStatus = await fetchPipelineStatus(signal);
      setStatus(nextStatus);
      setLoadError(null);
      return nextStatus;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      setLoadError(error instanceof Error ? error.message : 'Could not connect to the pipeline API.');
      return null;
    }
  }, []);

  const refreshIngestion = useCallback(async (signal?: AbortSignal) => {
    try {
      const nextStatus = await fetchIngestionStatus(signal);
      setIngestion(nextStatus);
      setIngestionError(null);
      return nextStatus;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      setIngestionError(error instanceof Error ? error.message : 'Could not load FIRMS ingestion status.');
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshStatus(controller.signal);
    void refreshIngestion(controller.signal);
    return () => controller.abort();
  }, [refreshIngestion, refreshStatus]);

  useEffect(() => {
    const handleGenerationStarted = () => {
      void refreshStatus();
    };
    window.addEventListener('terraignis:pipeline-generation-started', handleGenerationStarted);
    return () => window.removeEventListener('terraignis:pipeline-generation-started', handleGenerationStarted);
  }, [refreshStatus]);

  useEffect(() => {
    if (status?.status !== 'queued' && status?.status !== 'running') return;
    const timer = window.setInterval(() => void refreshStatus(), 1500);
    return () => window.clearInterval(timer);
  }, [refreshStatus, status?.status]);

  useEffect(() => {
    const nrtRunning = ingestion?.nrt.status === 'running';
    const jobStatus = ingestion?.historical.active_job?.status;
    const historicalRunning = jobStatus === 'queued' || jobStatus === 'running' || jobStatus === 'processing';
    if (!nrtRunning && !historicalRunning) return;
    const timer = window.setInterval(() => void refreshIngestion(), 2500);
    return () => window.clearInterval(timer);
  }, [ingestion?.historical.active_job?.status, ingestion?.nrt.status, refreshIngestion]);

  useEffect(() => {
    const nrt = ingestion?.nrt;
    if (!nrtNoticePendingRef.current || !nrt?.last_finished_at) return;
    if (nrt.last_finished_at === nrtNoticeBaselineRef.current || nrt.status === 'running') return;

    nrtNoticePendingRef.current = false;
    if (nrt.status === 'failed') {
      setIngestionNotice(`NRT poll failed: ${nrt.last_error || 'NASA FIRMS could not complete the download.'}`);
    } else if ((nrt.raw_files_added ?? 0) > 0) {
      const partial = nrt.last_error ? ' Some sources reported errors.' : '';
      setIngestionNotice(`NRT poll complete: ${nrt.raw_files_added} new files and ${(nrt.downloaded_records ?? 0).toLocaleString()} records.${partial}`);
    } else {
      setIngestionNotice('NRT poll complete. No new files were found.');
    }
  }, [ingestion]);

  useEffect(() => {
    if (!ingestionNotice && !ingestionError) return;
    const timer = window.setTimeout(() => {
      setIngestionNotice(null);
      setIngestionError(null);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [ingestionError, ingestionNotice]);

  const canGenerate = useMemo(
    () => (status?.raw_files.total ?? 0) > 0 && !uploading && !starting && status?.status !== 'queued' && status?.status !== 'running',
    [starting, status?.raw_files.total, status?.status, uploading],
  );

  const handleUpload = async () => {
    if (!selectedSensor) {
      setUploadError('Select MODIS or VIIRS as the data source before uploading.');
      setUploadResult(null);
      return;
    }
    if (selectedFiles.length === 0) {
      setUploadError('Choose at least one FIRMS file to upload.');
      setUploadResult(null);
      return;
    }
    setUploading(true);
    setUploadResult(null);
    setUploadError(null);
    try {
      const result = await uploadRawFiles(selectedFiles, selectedSensor);
      setUploadResult(result);
      setSelectedFiles([]);
      await refreshStatus();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Batch upload failed. No files were saved.');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    setStarting(true);
    setLoadError(null);
    try {
      await startPipeline();
      await refreshStatus();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not start dataset generation.');
    } finally {
      setStarting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshStatus(), refreshIngestion()]);
    setRefreshing(false);
  };

  const handleNrtRun = async () => {
    setHistoricalBusy(true);
    setIngestionError(null);
    setIngestionNotice(null);
    try {
      nrtNoticeBaselineRef.current = ingestion?.nrt.last_finished_at ?? null;
      nrtNoticePendingRef.current = true;
      const result = await startNrtIngestion(operatorToken);
      setIngestionNotice(result.message);
      await refreshIngestion();
    } catch (error) {
      nrtNoticePendingRef.current = false;
      setIngestionError(error instanceof Error ? error.message : 'Could not start an NRT poll.');
    } finally {
      setHistoricalBusy(false);
    }
  };

  const handleHistoricalStart = async () => {
    setIngestionError(null);
    setIngestionNotice(null);
    if (!historicalStart || !historicalEnd) {
      setIngestionError('Choose both a start date and an end date for the historical backfill.');
      return;
    }
    if (historicalStart > historicalEnd) {
      setIngestionError('The start date must be on or before the end date.');
      return;
    }
    if (historicalSources.length === 0) {
      setIngestionError('Select at least one Standard Processing product.');
      return;
    }
    setHistoricalBusy(true);
    try {
      const job = await startHistoricalIngestion({
        start_date: historicalStart,
        end_date: historicalEnd,
        area: historicalArea.trim() || 'world',
        sources: historicalSources,
      }, operatorToken);
      setIngestionNotice(`Historical backfill queued (${job.total_chunks} date chunks).`);
      await refreshIngestion();
    } catch (error) {
      setIngestionError(error instanceof Error ? error.message : 'Could not start the historical backfill.');
    } finally {
      setHistoricalBusy(false);
    }
  };

  const handleHistoricalAction = async (action: 'resume' | 'cancel', jobId: string) => {
    setHistoricalBusy(true);
    setIngestionError(null);
    setIngestionNotice(null);
    try {
      if (action === 'resume') await resumeHistoricalIngestion(jobId, operatorToken);
      else await cancelHistoricalIngestion(jobId, operatorToken);
      await refreshIngestion();
    } catch (error) {
      setIngestionError(error instanceof Error ? error.message : `Could not ${action} this historical job.`);
    } finally {
      setHistoricalBusy(false);
    }
  };

  const running = status?.status === 'queued' || status?.status === 'running';

  return (
    <div className="pipeline-view h-full overflow-y-auto p-4 lg:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="pipeline-kicker text-xs font-semibold uppercase tracking-[.16em] text-blue-600 dark:text-[#60a5fa]">NASA FIRMS · MODIS + VIIRS</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Data pipeline</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Download active-fire text or CSV files from NASA FIRMS, upload them here, then regenerate the datasets used by the dashboard API.
            </p>
          </div>
          <a
            href="https://firms.modaps.eosdis.nasa.gov/download/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ExternalLink size={15} /> NASA FIRMS archive
          </a>
        </header>

        {loadError && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 backdrop-blur-md px-4 py-3 text-sm text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-300">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {(ingestionError || ingestionNotice) && (
          <div role={ingestionError ? 'alert' : 'status'} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${ingestionError ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>
            <span>{ingestionError || ingestionNotice}</span>
            <button type="button" onClick={() => { setIngestionNotice(null); setIngestionError(null); }} className="shrink-0 rounded-full p-1 opacity-75 hover:opacity-100" aria-label="Dismiss notification"><X size={15} /></button>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"><Radio size={20} /></div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Automated FIRMS ingestion</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">Track scheduled Near Real-Time polling and request resumable Standard Processing backfills. Downloaded files are preserved and flow through the existing dataset pipeline.</p>
              </div>
            </div>
            <button type="button" onClick={() => void handleNrtRun()} disabled={!ingestion?.nrt.configured || ingestion?.nrt.status === 'running' || historicalBusy} className="pipeline-action-button inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45">
              {ingestion?.nrt.status === 'running' || historicalBusy ? <LoaderCircle size={16} className="animate-spin" /> : <RotateCw size={16} />}
              Run NRT poll
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 px-4 py-3"><span className="text-xs font-medium text-slate-500">NRT scheduler</span><p className="mt-1 text-sm font-semibold text-slate-900">{ingestion ? ingestion.nrt.enabled ? `Enabled · every ${ingestion.nrt.interval_minutes ?? 30} min` : 'Disabled' : 'Loading…'}</p></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><span className="text-xs font-medium text-slate-500">Last successful poll</span><p className="mt-1 text-sm font-semibold text-slate-900">{formatTimestamp(ingestion?.nrt.last_success_at)}</p></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><span className="text-xs font-medium text-slate-500">Next scheduled poll</span><p className="mt-1 text-sm font-semibold text-slate-900">{formatTimestamp(ingestion?.nrt.next_run_at)}</p></div>
          </div>

          {ingestion?.nrt.last_error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{ingestion.nrt.last_error}</p>}
          {ingestion?.nrt.sources && Object.keys(ingestion.nrt.sources).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">{Object.entries(ingestion.nrt.sources).map(([source, result]) => <span key={source} className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600">{source}: {result.status}{result.downloaded_records !== undefined ? ` · ${result.downloaded_records.toLocaleString()} records` : ''}</span>)}</div>
          )}

          <details className="mt-4 rounded-xl border border-slate-200 px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-600"><LockKeyhole size={14} /> Operator authorization (optional)</summary>
            <label className="mt-3 block text-xs text-slate-500" htmlFor="firms-operator-token">Bearer token</label>
            <input id="firms-operator-token" type="password" autoComplete="off" value={operatorToken} onChange={(event) => setOperatorToken(event.currentTarget.value)} placeholder="Enter FIRMS_INGESTION_TOKEN if configured" className="mt-1 w-full max-w-lg rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm" />
            <p className="mt-1 text-xs text-slate-500">Kept only in this page while it is open; it is sent only with operator actions.</p>
          </details>

          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="flex items-center gap-2"><CalendarDays size={17} className="text-indigo-600 dark:text-indigo-300" /><h3 className="text-sm font-semibold text-slate-900">Historical backfill</h3></div>
            <p className="mt-1 text-xs text-slate-500">FIRMS availability is checked before the download. Requests are split into chunks of up to five days and can resume after interruptions.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-slate-600">Start date<input type="date" value={historicalStart} onChange={(event) => setHistoricalStart(event.currentTarget.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" /></label>
              <label className="text-xs font-medium text-slate-600">End date<input type="date" value={historicalEnd} onChange={(event) => setHistoricalEnd(event.currentTarget.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" /></label>
              <label className="text-xs font-medium text-slate-600">Coverage: world or west,south,east,north<input type="text" value={historicalArea} onChange={(event) => setHistoricalArea(event.currentTarget.value)} placeholder="world" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800" /></label>
              <div className="flex items-end"><button type="button" onClick={() => void handleHistoricalStart()} disabled={historicalBusy || !ingestion?.historical.configured || !ingestion.historical.enabled} className="pipeline-action-button inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-45">{historicalBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}Start backfill</button></div>
            </div>
            {ingestion && !ingestion.historical.enabled && <p className="mt-2 text-xs text-slate-500">Enable historical backfills with FIRMS_HISTORICAL_ENABLED=true in backend/.env.</p>}
            <fieldset className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <legend className="mb-2 text-xs font-medium text-slate-600">Standard Processing products</legend>
              {HISTORICAL_PRODUCTS.map((source) => <label key={source} className="inline-flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={historicalSources.includes(source)} onChange={(event) => {
                const checked = event.currentTarget.checked;
                setHistoricalSources((current) => {
                  if (checked) return current.includes(source) ? current : [...current, source];
                  return current.filter((item) => item !== source);
                });
              }} />{source}</label>)}
            </fieldset>
          </div>

          {ingestion?.historical.active_job && (() => {
            const job = ingestion.historical.active_job;
            const active = ['queued', 'running', 'processing'].includes(job.status);
            const retryable = ['partial_failure', 'processing_failed', 'cancelled'].includes(job.status);
            return <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-slate-900">Historical job · {job.status.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-slate-500">{job.requested_start_date} – {job.requested_end_date} · {job.sources.join(', ')} · {job.completed_chunks}/{job.total_chunks} chunks · {job.downloaded_records.toLocaleString()} records</p></div>
                <div className="flex gap-2">{active && <button type="button" onClick={() => void handleHistoricalAction('cancel', job.job_id)} disabled={historicalBusy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-45"><XCircle size={14} />Cancel</button>}{retryable && <button type="button" onClick={() => void handleHistoricalAction('resume', job.job_id)} disabled={historicalBusy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-45"><RotateCw size={14} />Resume</button>}</div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${job.progress_percent}%` }} /></div>
              {job.last_error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{job.last_error}</p>}
              <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Review date chunks ({job.chunks.length})</summary><ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">{job.chunks.map((chunk, index) => <li key={`${chunk.source}-${chunk.start_date}-${index}`} className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600"><span>{chunk.source} · {chunk.start_date} – {chunk.end_date}</span><span>{chunk.status}{chunk.records ? ` · ${chunk.records.toLocaleString()} records` : ''}</span></li>)}</ul></details>
            </div>;
          })()}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
              <UploadCloud size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">1. Upload raw FIRMS files</h2>
              <p className="mt-1 text-sm text-slate-600">
                Choose the source, select all files for that sensor, then send them together in one upload.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label htmlFor="pipeline-sensor" className="text-sm font-semibold text-slate-700">Data source</label>
            <select
              id="pipeline-sensor"
              value={selectedSensor}
              onChange={(event) => {
                setSelectedSensor(event.currentTarget.value as 'MODIS' | 'VIIRS' | '');
                setUploadError(null);
              }}
              disabled={uploading || running}
              aria-invalid={!selectedSensor && Boolean(uploadError)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
            >
              <option value="" disabled>Select sensor</option>
              <option value="MODIS">MODIS</option>
              <option value="VIIRS">VIIRS</option>
            </select>
            <span className="text-xs text-slate-500">Upload one sensor type per batch; mixed batches are rejected.</span>
          </div>

          <label className="mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-500/10">
            <UploadCloud size={24} className="text-slate-500" />
            <span className="mt-2 text-sm font-semibold text-slate-800">Choose NASA FIRMS files</span>
            <span className="mt-1 text-xs text-slate-500">TXT or CSV · up to 512 MB per file</span>
            <input
              type="file"
              multiple
              accept=".txt,.csv,text/plain,text/csv"
              className="sr-only"
              disabled={uploading || running}
              onChange={(event) => {
                setSelectedFiles(Array.from(event.currentTarget.files ?? []));
                setUploadError(null);
                event.currentTarget.value = '';
              }}
            />
          </label>

          {selectedFiles.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                <span>
                  {selectedFiles.length} {selectedSensor} file{selectedFiles.length === 1 ? '' : 's'} ·{' '}
                  {formatBytes(selectedFiles.reduce((sum, file) => sum + file.size, 0))} total
                </span>
                <button type="button" onClick={() => setSelectedFiles([])} className="text-slate-500 hover:text-slate-900" disabled={uploading}>Clear</button>
              </div>
              <details className="px-3 py-2">
                <summary className="cursor-pointer text-xs text-slate-500">Review selected files</summary>
                <ul className="mt-2 max-h-40 divide-y divide-slate-100 overflow-y-auto">
                  {selectedFiles.map((file) => (
                    <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2 text-slate-700"><FileText size={14} className="shrink-0 text-slate-400" /><span className="truncate">{file.name}</span></span>
                      <span className="shrink-0 tabular-nums text-slate-500">{formatBytes(file.size)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={uploading || running}
              className="pipeline-action-button inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {uploading ? <LoaderCircle size={16} className="animate-spin" /> : <UploadCloud size={16} />}
              {uploading ? `Uploading ${selectedFiles.length} files…` : `Upload ${selectedFiles.length || ''} files together`}
            </button>
            <span className="text-xs text-slate-500">
              Existing raw files are kept. Identical re-uploads are skipped.
            </span>
          </div>

          {uploadResult && (
            <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" aria-live="polite">
              Uploaded batch: {uploadResult.total_files} {uploadResult.sensor} files · {uploadResult.uploaded_files} new · {uploadResult.duplicate_files} already present.
            </div>
          )}
          {uploadError && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{uploadError}</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                <Database size={20} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">2. Generate dashboard datasets</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Runs the six pipeline commands in README order against every raw file in the backend data folders. TerraIgnis serves generated Parquet datasets; this rebuilds those files rather than creating a separate SQL database.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                title="Refresh file counts and pipeline status"
                aria-label="Refresh file counts and pipeline status"
                className="glass-btn inline-flex items-center justify-center rounded-lg p-2.5 disabled:opacity-45"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={!canGenerate}
                className="pipeline-action-button inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {running || starting ? <LoaderCircle size={16} className="animate-spin" /> : status?.status === 'succeeded' ? <RotateCw size={16} /> : <Play size={16} />}
                {running ? 'Generating…' : starting ? 'Starting…' : status?.status === 'succeeded' ? 'Generate again' : 'Generate datasets'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['MODIS', 'VIIRS', 'total'] as const).map((sensor) => (
              <div key={sensor} className="rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-xs font-medium text-slate-500">{sensor === 'total' ? 'Total raw files' : `${sensor} files`}</span>
                <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{status?.raw_files[sensor] ?? '—'}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/70">
            <span className="font-medium text-slate-500">Last successful dataset generation</span>
            <time className="tabular-nums text-slate-700 dark:text-slate-200">
              {formatTimestamp(status?.last_successful_at)}
            </time>
          </div>

          {status && status.status !== 'idle' && (
            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {status.status === 'succeeded' ? 'Generation complete' : status.status === 'failed' ? 'Generation failed' : 'Generation in progress'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{status.message}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${status.status === 'succeeded' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' : status.status === 'failed' ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300'}`}>
                  {status.status}
                </span>
              </div>

              <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {status.stages.map((stage, index) => (
                  <li key={stage.name} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    {stageIcon(stage.status)}
                    <span className="text-slate-500">{index + 1}.</span>
                    <span className="text-slate-800">{stage.name}</span>
                  </li>
                ))}
              </ol>

              {status.logs.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">Pipeline log</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">{status.logs.join('\n')}</pre>
                </details>
              )}
            </div>
          )}

          {!status?.status && <p className="mt-4 text-xs text-slate-500">Checking the backend raw-file inventory…</p>}
        </section>
      </div>
    </div>
  );
}
