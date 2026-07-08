import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Table } from 'lucide-react';

export default function ExportRegistryMenu() {
  const [open, setOpen] = useState(false);

  const startDownload = (format: 'csv' | 'xlsx' | 'pdf') => {
    window.open(`/api/export-registry?format=${format}`, '_blank');
    setOpen(false);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-slate-950 rounded-xl text-xs font-black transition-all shadow flex items-center gap-1.5"
      >
        <Download size={13} />
        Export Registry
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-white border border-slate-100 shadow-2xl p-2 z-40 animate-slide-up">
          <button onClick={() => startDownload('csv')} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700">
            <Table size={14} className="text-slate-400" />
            CSV Registry
          </button>
          <button onClick={() => startDownload('xlsx')} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700">
            <FileSpreadsheet size={14} className="text-emerald-600" />
            Excel Registry
          </button>
          <button onClick={() => startDownload('pdf')} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700">
            <FileText size={14} className="text-rose-600" />
            PDF Registry
          </button>
          <div className="border-t border-slate-100 mt-1 pt-2 px-3 pb-1">
            <p className="text-[9px] leading-relaxed text-slate-400 font-semibold">
              Branded with EVENTZ and the ETS.NTECH slogan.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
