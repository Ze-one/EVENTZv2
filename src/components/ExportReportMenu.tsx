import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Table } from 'lucide-react';

type ExportKind = 'checked-in' | 'roster' | 'scan-logs' | 'email-logs';

interface ExportReportMenuProps {
  kind: ExportKind;
  label: string;
  disabled?: boolean;
  variant?: 'dark' | 'gold';
}

export default function ExportReportMenu({ kind, label, disabled = false, variant = 'dark' }: ExportReportMenuProps) {
  const [open, setOpen] = useState(false);

  const startDownload = (format: 'csv' | 'xlsx' | 'pdf') => {
    window.open(`/api/export-report?kind=${kind}&format=${format}`, '_blank');
    setOpen(false);
  };

  const buttonClass = variant === 'gold'
    ? 'bg-yellow-400 hover:bg-yellow-300 text-slate-950'
    : 'bg-slate-900 hover:bg-slate-800 text-white';

  return (
    <div className="relative w-full text-left">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full ${buttonClass} disabled:opacity-50 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow`}
      >
        <Download size={13} />
        {label}
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 bottom-full mb-2 rounded-2xl bg-white border border-slate-100 shadow-2xl p-2 z-50 animate-slide-up">
          <button onClick={() => startDownload('csv')} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700">
            <Table size={14} className="text-slate-400" />
            Download CSV
          </button>
          <button onClick={() => startDownload('xlsx')} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700">
            <FileSpreadsheet size={14} className="text-emerald-600" />
            Download Excel
          </button>
          <button onClick={() => startDownload('pdf')} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700">
            <FileText size={14} className="text-rose-600" />
            Download PDF
          </button>
          <p className="text-[9px] leading-relaxed text-slate-400 font-semibold px-3 pt-2 border-t border-slate-100 mt-1">
            EVENTZ branded export with slogan.
          </p>
        </div>
      )}
    </div>
  );
}
