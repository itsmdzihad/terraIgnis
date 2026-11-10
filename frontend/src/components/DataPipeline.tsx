import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  LoaderCircle,
  Play,
  RotateCw,
  UploadCloud,
} from 'lucide-react';
import {
  fetchPipelineStatus,
  startPipeline,
  uploadRawFile,
  type PipelineStatus,
  type RawUploadResult,
} from '../services/pipeline';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stageIcon(stageStatus: string) {
  if (stageStatus === 'succeeded') return <CheckCircle2 size={17} className="text-emerald-500" />;
  if (stageStatus === 'running') return <LoaderCircle size={17} className="animate-spin text-indigo-500" />;
  if (stageStatus === 'failed') return <AlertTriangle size={17} className="text-rose-500" />;
  return <Clock3 size={17} className="text-slate-400" />;
}

export default function DataPipeline() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<RawUploadResult[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  useEffect(() => {
    const controller = new AbortController();
    void refreshStatus(controller.signal);
    return () => controller.abort();
  }, [refreshStatus]);

  useEffect(() => {
    if (status?.status !== 'queued' && status?.status !== 'running') return;
    const timer = window.setInterval(() => void refreshStatus(), 1500);
    return () => window.clearInterval(timer);
  }, [refreshStatus, status?.status]);

  const canGenerate = useMemo(
    () => (status?.raw_files.total ?? 0) > 0 && !uploading && !starting && status?.status !== 'queued' && status?.status !== 'running',
    [starting, status?.raw_files.total, status?.status, uploading],
  );

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    setUploads([]);
    setUploadErrors([]);

    const successfulUploads: RawUploadResult[] = [];
    const failures: string[] = [];
    for (const [index, file] of selectedFiles.entries()) {
      try {
        successfulUploads.push(await uploadRawFile(file));
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`);
      }
      setUploadProgress(index + 1);
    }

    setUploads(successfulUploads);
    setUploadErrors(failures);
    setSelectedFiles([]);
    setUploading(false);
    await refreshStatus();
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

  const running = status?.status === 'queued' || status?.status === 'running';

  return (
    <div className="pipeline-view h-full overflow-y-auto p-4 lg:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">NASA FIRMS · MODIS + VIIRS</p>
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
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <UploadCloud size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">1. Upload raw FIRMS files</h2>
              <p className="mt-1 text-sm text-slate-600">
                Select any number of MODIS and VIIRS <code className="rounded bg-slate-100 px-1">.txt</code> or <code className="rounded bg-slate-100 px-1">.csv</code> downloads. Sensor type is detected from each file’s NASA header.
              </p>
            </div>
          </div>

          <label className="mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40">
            <UploadCloud size={24} className="text-slate-500" />
            <span className="mt-2 text-sm font-semibold text-slate-800">Choose NASA FIRMS files</span>
            <span className="mt-1 text-xs text-slate-500">TXT or CSV · up to 512 MB per file</span>
            <input
              type="file"
              multiple
              accept=".txt,.csv,text/plain,text/csv"
              className="sr-only"
              disabled={uploading || running}
              onChange={(event) => setSelectedFiles(Array.from(event.currentTarget.files ?? []))}
            />
          </label>

          {selectedFiles.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                <span>{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected</span>
                <button type="button" onClick={() => setSelectedFiles([])} className="text-slate-500 hover:text-slate-900" disabled={uploading}>Clear</button>
              </div>
              <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto px-3">
                {selectedFiles.map((file) => (
                  <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2 text-slate-700"><FileText size={14} className="shrink-0 text-slate-400" /><span className="truncate">{file.name}</span></span>
                    <span className="shrink-0 tabular-nums text-slate-500">{formatBytes(file.size)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={selectedFiles.length === 0 || uploading || running}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {uploading ? <LoaderCircle size={16} className="animate-spin" /> : <UploadCloud size={16} />}
              {uploading ? `Uploading ${uploadProgress}/${selectedFiles.length}…` : 'Upload selected files'}
            </button>
            <span className="text-xs text-slate-500">
              Existing raw files are kept. Identical re-uploads are skipped.
            </span>
          </div>

          {(uploads.length > 0 || uploadErrors.length > 0) && (
            <div className="mt-4 space-y-2" aria-live="polite">
              {uploads.map((upload) => (
                <div key={upload.stored_filename} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <span>{upload.duplicate ? 'Already present' : 'Saved'} · {upload.filename} · {upload.sensor}</span>
                  <span className="tabular-nums">{formatBytes(upload.bytes)}</span>
                </div>
              ))}
              {uploadErrors.map((error) => (
                <p key={error} className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <Database size={20} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">2. Generate dashboard datasets</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Runs the six pipeline commands in README order against every raw file in the backend data folders. TerraIgnis serves generated Parquet datasets; this rebuilds those files rather than creating a separate SQL database.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {running || starting ? <LoaderCircle size={16} className="animate-spin" /> : status?.status === 'succeeded' ? <RotateCw size={16} /> : <Play size={16} />}
              {running ? 'Generating…' : starting ? 'Starting…' : status?.status === 'succeeded' ? 'Generate again' : 'Generate datasets'}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['MODIS', 'VIIRS', 'total'] as const).map((sensor) => (
              <div key={sensor} className="rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-xs font-medium text-slate-500">{sensor === 'total' ? 'Total raw files' : `${sensor} files`}</span>
                <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{status?.raw_files[sensor] ?? '—'}</div>
              </div>
            ))}
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
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${status.status === 'succeeded' ? 'bg-emerald-100 text-emerald-800' : status.status === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-indigo-100 text-indigo-800'}`}>
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
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200">{status.logs.join('\n')}</pre>
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
