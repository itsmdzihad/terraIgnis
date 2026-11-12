import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Pause,
  Play,
  Radio,
  RotateCw,
  RefreshCw,
  Trash2,
  XCircle,
  X,
  UploadCloud,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchPipelineStatus,
  fetchIngestionStatus,
  startNrtIngestion,
  startHistoricalIngestion,
  resumeHistoricalIngestion,
  cancelHistoricalIngestion,
  clearPipelineData,
  notifyDatasetsUpdated,
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

function explainIngestionError(message: string, action: string): string {
  if (message.includes('FIRMS_INGESTION_TOKEN')) {
    return `${action} requires a token because FIRMS_INGESTION_TOKEN is configured on the backend. Enter that exact token, or unset the variable to allow public ingestion.`;
  }
  if (message.toLowerCase().includes('authorization')) {
    return `The ${action.toLowerCase()} request was rejected. This backend has token protection enabled; enter its configured FIRMS_INGESTION_TOKEN or ask the deployment operator to unset it.`;
  }
  return message;
}

function stageIcon(stageStatus: string) {
  if (stageStatus === 'succeeded') return <CheckCircle2 size={17} className="text-emerald-500" />;
  if (stageStatus === 'running') return <LoaderCircle size={17} className="animate-spin text-blue-600 dark:text-blue-400" />;
  if (stageStatus === 'failed') return <AlertTriangle size={17} className="text-rose-500" />;
  return <Clock3 size={17} className="text-slate-400" />;
}

function scrollToGenerationProcess() {
  window.requestAnimationFrame(() => {
    const container = document.querySelector<HTMLElement>('.pipeline-view');
    const target = document.getElementById('dataset-generation-process');
    if (!container || !target) return;
    const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({ top: Math.max(0, offset - 96), behavior: 'smooth' });
  });
}

export default function DataPipeline() {
  const location = useLocation();
  const navigate = useNavigate();
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
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [generationCompletedJobId, setGenerationCompletedJobId] = useState<string | null>(null);
  const [dismissedBackfillGuideJobId, setDismissedBackfillGuideJobId] = useState<string | null>(null);
  const nrtNoticePendingRef = useRef(false);
  const nrtNoticeBaselineRef = useRef<string | null>(null);
  const generationJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handleScrollRequest = () => scrollToGenerationProcess();
    window.addEventListener('terraignis:scroll-to-generation-process', handleScrollRequest);
    if (location.hash === '#dataset-generation-process') handleScrollRequest();
    return () => window.removeEventListener('terraignis:scroll-to-generation-process', handleScrollRequest);
  }, [location.hash]);

  const refreshStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const nextStatus = await fetchPipelineStatus(signal);
      if ((nextStatus.status === 'queued' || nextStatus.status === 'running') && nextStatus.job_id) {
        generationJobIdRef.current = nextStatus.job_id;
      }
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
    const handleStarted = (event: Event) => {
      const jobId = (event as CustomEvent<{ job_id?: string }>).detail?.job_id;
      if (jobId) generationJobIdRef.current = jobId;
      handleGenerationStarted();
    };
    window.addEventListener('terraignis:pipeline-generation-started', handleStarted);
    return () => window.removeEventListener('terraignis:pipeline-generation-started', handleStarted);
  }, [refreshStatus]);

  useEffect(() => {
    if (status?.status !== 'queued' && status?.status !== 'running') return;
    const timer = window.setInterval(() => void refreshStatus(), 1500);
    return () => window.clearInterval(timer);
  }, [refreshStatus, status?.status]);

  useEffect(() => {
    if (status?.status !== 'succeeded' || !status.job_id) return;
    if (generationJobIdRef.current !== status.job_id) return;
    notifyDatasetsUpdated(status.job_id);
    generationJobIdRef.current = null;
    if (location.pathname === '/pipeline') setGenerationCompletedJobId(status.job_id);
  }, [location.pathname, status?.job_id, status?.status]);

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
      const result = await startPipeline();
      generationJobIdRef.current = result.job_id;
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

  const handleClearData = async () => {
    if (!resetPassword) {
      setResetError('Enter the confirmation password to continue.');
      return;
    }
    setResetBusy(true);
    setResetError(null);
    try {
      const result = await clearPipelineData(resetPassword);
      setResetModalOpen(false);
      setResetPassword('');
      setIngestionNotice(result.message);
      await Promise.all([refreshStatus(), refreshIngestion()]);
      notifyDatasetsUpdated(`data-cleared-${Date.now()}`);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Could not clear FIRMS data.');
    } finally {
      setResetBusy(false);
    }
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
      const message = error instanceof Error ? error.message : 'Could not start an NRT poll.';
      setIngestionError(explainIngestionError(message, 'NRT polling'));
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
      const message = error instanceof Error ? error.message : 'Could not start the historical backfill.';
      setIngestionError(explainIngestionError(message, 'Historical backfill'));
    } finally {
      setHistoricalBusy(false);
    }
  };

  const handleHistoricalAction = async (action: 'resume' | 'pause', jobId: string) => {
    setHistoricalBusy(true);
    setIngestionError(null);
    setIngestionNotice(null);
    try {
      if (action === 'resume') {
        await resumeHistoricalIngestion(jobId, operatorToken);
        setDismissedBackfillGuideJobId(null);
      } else {
        await cancelHistoricalIngestion(jobId, operatorToken);
        setIngestionNotice('Backfill paused. Downloaded files are preserved. You can generate datasets from them now, then resume this job after the FIRMS 10-minute transaction window resets.');
      }
      await refreshIngestion();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not ${action} this historical job.`;
      setIngestionError(explainIngestionError(message, action === 'pause' ? 'Could not pause the historical job' : 'Could not resume the historical job'));
    } finally {
      setHistoricalBusy(false);
    }
  };

  const running = status?.status === 'queued' || status?.status === 'running';
  const activeHistoricalJob = ingestion?.historical.active_job;
  const historicalJobIsActive = ['queued', 'running', 'processing'].includes(activeHistoricalJob?.status ?? '');
  const showBackfillGuide = Boolean(historicalJobIsActive && activeHistoricalJob?.job_id !== dismissedBackfillGuideJobId);
  const nrtPullRunning = ingestion?.nrt.status === 'running';
  const resetBlocked = running || uploading || historicalBusy || nrtPullRunning || historicalJobIsActive;

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

          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/55">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200"><LockKeyhole size={14} /> Optional operator authorization</summary>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave blank for public ingestion. A token is required only if the backend operator explicitly sets FIRMS_INGESTION_TOKEN.</p>
            <label className="mt-3 block text-xs text-slate-500 dark:text-slate-400" htmlFor="firms-operator-token">Bearer token</label>
            <input id="firms-operator-token" type="password" autoComplete="off" value={operatorToken} onChange={(event) => setOperatorToken(event.currentTarget.value)} placeholder="Leave blank unless token protection is enabled" className="mt-1 w-full max-w-lg rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The token stays in this tab’s memory and is sent only with ingestion requests.</p>
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
                <div className="flex gap-2">{active && <button type="button" onClick={() => void handleHistoricalAction('pause', job.job_id)} disabled={historicalBusy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-45"><Pause size={14} />Pause backfill</button>}{retryable && <button type="button" onClick={() => void handleHistoricalAction('resume', job.job_id)} disabled={historicalBusy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-45"><RotateCw size={14} />Resume</button>}</div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${job.progress_percent}%` }} /></div>
              {job.last_error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{job.last_error}</p>}
              <details open className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Review date chunks ({job.chunks.length})</summary><ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">{job.chunks.map((chunk, index) => <li key={`${chunk.source}-${chunk.start_date}-${index}`} className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600"><span>{chunk.source} · {chunk.start_date} – {chunk.end_date}</span><span>{chunk.status}{chunk.records ? ` · ${chunk.records.toLocaleString()} records` : ''}</span></li>)}</ul></details>
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

        <section id="dataset-generation-process" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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
              <span className="group/clear-data relative inline-flex" tabIndex={nrtPullRunning ? 0 : undefined}>
                <button
                  type="button"
                  onClick={() => { setResetError(null); setResetPassword(''); setResetModalOpen(true); }}
                  disabled={resetBlocked}
                  aria-describedby={nrtPullRunning ? 'clear-data-nrt-tooltip' : undefined}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-300 px-3 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  <Trash2 size={16} /> Clear all data
                </button>
                {nrtPullRunning && (
                  <span id="clear-data-nrt-tooltip" role="tooltip" className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-100 opacity-0 shadow-xl transition group-hover/clear-data:visible group-hover/clear-data:opacity-100 group-focus/clear-data:visible group-focus/clear-data:opacity-100">
                    NRT data pulling is in progress. You can clear all data after the pull finishes.
                  </span>
                )}
              </span>
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
                <details open className="mt-4">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">Pipeline log</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">{status.logs.join('\n')}</pre>
                </details>
              )}
            </div>
          )}

          {!status?.status && <p className="mt-4 text-xs text-slate-500">Checking the backend raw-file inventory…</p>}
        </section>
      </div>

      {showBackfillGuide && activeHistoricalJob && (
        createPortal(<aside role="dialog" aria-labelledby="backfill-rate-limit-title" className="fixed right-4 top-24 z-[100] w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-amber-300 bg-white p-5 shadow-2xl dark:border-amber-500/40 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><Clock3 size={20} /></div>
            <div className="min-w-0 flex-1">
              <h2 id="backfill-rate-limit-title" className="text-base font-bold text-slate-900 dark:text-slate-100">Large backfills may reach FIRMS’ rate limit</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">NASA FIRMS MAP_KEY allows 5,000 transactions per 10-minute interval. Larger date requests can count as multiple transactions, so a large backfill may be temporarily throttled.</p>
            </div>
            <button type="button" onClick={() => setDismissedBackfillGuideJobId(activeHistoricalJob.job_id)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Dismiss backfill rate limit information"><X size={18} /></button>
          </div>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-300">
            <li>Pause the backfill if FIRMS starts rejecting requests.</li>
            <li>Generate datasets now to use the files already downloaded.</li>
            <li>After about 10 minutes, return here and choose <strong>Resume</strong>. It continues with unfinished chunks.</li>
          </ol>
          <a href="https://firms.modaps.eosdis.nasa.gov/api/map_key" target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-indigo-600 underline dark:text-indigo-300">NASA FIRMS MAP_KEY limits</a>
        </aside>, document.body)
      )}

      {generationCompletedJobId && (
        createPortal(<div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md">
          <section role="dialog" aria-modal="true" aria-labelledby="generation-complete-title" className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-5 shadow-2xl dark:border-emerald-500/30 dark:bg-slate-900 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><CheckCircle2 size={20} /></div>
              <div className="min-w-0 flex-1">
                <h2 id="generation-complete-title" className="text-base font-bold text-slate-900 dark:text-slate-100">Dataset generation is complete</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">The dashboard datasets are updated. Open Fire Overview to see the refreshed map and analysis.</p>
              </div>
              <button type="button" onClick={() => setGenerationCompletedJobId(null)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close generation complete dialog"><X size={18} /></button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setGenerationCompletedJobId(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Stay on Data Pipeline</button>
              <button type="button" onClick={() => { setGenerationCompletedJobId(null); navigate('/'); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">Go to Fire Overview</button>
            </div>
          </section>
        </div>, document.body)
      )}

      {resetModalOpen && (
        createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget && !resetBusy) setResetModalOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="clear-data-title" className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-5 shadow-2xl dark:border-rose-500/30 dark:bg-slate-900 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"><AlertTriangle size={20} /></div>
              <div className="min-w-0 flex-1">
                <h2 id="clear-data-title" className="text-base font-bold text-slate-900 dark:text-slate-100">Clear all FIRMS data?</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">This permanently deletes uploaded and downloaded raw files, processed datasets, reports, and ingestion history from this deployment.</p>
              </div>
              <button type="button" onClick={() => setResetModalOpen(false)} disabled={resetBusy} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800" aria-label="Close confirmation"><X size={18} /></button>
            </div>
            <label htmlFor="clear-data-password" className="mt-5 block text-sm font-medium text-slate-700 dark:text-slate-200">Confirmation password</label>
            <input id="clear-data-password" type="password" autoComplete="current-password" autoFocus value={resetPassword} onChange={(event) => { setResetPassword(event.currentTarget.value); setResetError(null); }} onKeyDown={(event) => { if (event.key === 'Enter' && !resetBusy) void handleClearData(); }} placeholder="Enter password" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            {resetError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{resetError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setResetModalOpen(false)} disabled={resetBusy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
              <button type="button" onClick={() => void handleClearData()} disabled={resetBusy || !resetPassword} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-rose-600 dark:hover:bg-rose-500">{resetBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}{resetBusy ? 'Clearing…' : 'Clear all data'}</button>
            </div>
          </section>
        </div>, document.body)
      )}
    </div>
  );
}
