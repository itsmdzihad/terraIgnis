import { Database } from 'lucide-react';
import { Link } from 'react-router-dom';

export function isDatasetUnavailableError(error: string | null): boolean {
  if (!error) return false;
  const message = error.toLowerCase();
  return (
    message.includes('processed analytical data is temporarily unavailable') ||
    message.includes('processed data directory is unavailable') ||
    message.includes('processed dataset')
  );
}

export default function DatasetSetupNotice({ compact = false }: { compact?: boolean }) {
  return (
    <section
      role="status"
      className={`glass-panel-strong rounded-3xl border border-sky-400/35 ${compact ? 'p-4 sm:p-5' : 'p-6 sm:p-8'}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-300">
          <Database size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-semibold glass-heading">
            No fire dataset has been generated yet
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed glass-muted">
            TerraIgnis needs FIRMS observations and a generated dataset before it can show maps,
            cell histories, or daily analysis.
          </p>
          <ol className="mt-3 space-y-1.5 text-xs leading-relaxed glass-muted list-decimal pl-4">
            <li>
              In Data Pipeline, run an <strong className="glass-heading">NRT poll</strong> for recent
              data or start a <strong className="glass-heading">historical backfill</strong> for a date range.
            </li>
            <li>
              When ingestion finishes, choose <strong className="glass-heading">Generate datasets</strong>.
              Then return here to view the map and analysis.
            </li>
          </ol>
          <Link
            to="/pipeline"
            className="inline-flex mt-4 items-center justify-center rounded-full glass-btn-primary px-4 py-2 text-xs font-semibold"
          >
            Go to Data Pipeline
          </Link>
        </div>
      </div>
    </section>
  );
}
