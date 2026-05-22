'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface ParsedRow {
  full_name: string;
  email: string;
  gender: string;
  dob?: string;
  phone?: string;
  skill_rating?: string;
}

interface ImportResults {
  linked: number;
  provisional: number;
  skipped: number;
  errors: string[];
}

interface Props {
  tournamentId: string;
  categoryId: string;
}

function parseCSV(text: string): { rows: ParsedRow[]; headerError: string | null } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [], headerError: 'CSV must have a header row and at least one data row.' };

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));

  const nameIdx = header.indexOf('full_name');
  const emailIdx = header.indexOf('email');
  const genderIdx = header.indexOf('gender');
  const dobIdx = header.indexOf('dob');
  const phoneIdx = header.indexOf('phone');
  const skillIdx = header.indexOf('skill_rating');

  if (nameIdx === -1 || emailIdx === -1 || genderIdx === -1) {
    return {
      rows: [],
      headerError: 'CSV must include columns: full_name, email, gender',
    };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: ParsedRow = {
      full_name: cols[nameIdx] ?? '',
      email: cols[emailIdx] ?? '',
      gender: cols[genderIdx] ?? '',
    };
    if (dobIdx !== -1 && cols[dobIdx]) row.dob = cols[dobIdx];
    if (phoneIdx !== -1 && cols[phoneIdx]) row.phone = cols[phoneIdx];
    if (skillIdx !== -1 && cols[skillIdx]) row.skill_rating = cols[skillIdx];
    if (row.full_name || row.email) rows.push(row);
  }

  return { rows, headerError: null };
}

const EXAMPLE_CSV = `full_name,email,gender
Alice Smith,alice@example.com,female
Bob Jones,bob@example.com,male`;

export function ImportPlayersPanel({ tournamentId, categoryId }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);

  function handleTextChange(text: string) {
    setCsvText(text);
    setResults(null);
    if (!text.trim()) {
      setPreview(null);
      setParseError(null);
      return;
    }
    const { rows, headerError } = parseCSV(text);
    if (headerError) {
      setParseError(headerError);
      setPreview(null);
    } else {
      setParseError(null);
      setPreview(rows);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      handleTextChange(text);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    setResults(null);

    try {
      const res = await fetch('/api/players/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: tournamentId,
          category_id: categoryId,
          rows: preview,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResults({ linked: 0, provisional: 0, skipped: preview.length, errors: [data.error ?? 'Import failed'] });
      } else {
        setResults(data.results);
        setCsvText('');
        setPreview(null);
        router.refresh();
      }
    } catch {
      setResults({ linked: 0, provisional: 0, skipped: preview.length, errors: ['Network error — please try again'] });
    }

    setImporting(false);
  }

  function handleReset() {
    setCsvText('');
    setPreview(null);
    setParseError(null);
    setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-surface-border py-4 text-sm text-slate-500 hover:border-brand-500/50 hover:text-slate-300 transition-colors"
      >
        <span className="text-base">📋</span>
        Import players via CSV
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
        <h3 className="text-sm font-semibold text-white">CSV import</h3>
        <button
          onClick={() => { setOpen(false); handleReset(); }}
          className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          ✕ Close
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Instructions */}
        <div className="rounded-lg bg-surface px-4 py-3 ring-1 ring-surface-border">
          <p className="text-xs font-medium text-slate-400 mb-1">Required columns</p>
          <p className="text-xs text-slate-500">
            <code className="text-brand-300">full_name</code>,{' '}
            <code className="text-brand-300">email</code>,{' '}
            <code className="text-brand-300">gender</code>
            {' '}(male / female / other)
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Optional: <code className="text-slate-400">dob</code>,{' '}
            <code className="text-slate-400">phone</code>,{' '}
            <code className="text-slate-400">skill_rating</code>
          </p>
        </div>

        {/* File upload */}
        <div className="flex items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs text-slate-400 hover:border-brand-500/50 hover:text-slate-300 transition-colors">
            📁 Upload .csv file
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          <span className="text-xs text-slate-400">or paste CSV below</span>
        </div>

        {/* Paste area */}
        <div>
          <textarea
            value={csvText}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={6}
            placeholder={EXAMPLE_CSV}
            className="w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition resize-y"
          />
        </div>

        {/* Parse error */}
        {parseError && (
          <div className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">
            {parseError}
          </div>
        )}

        {/* Preview */}
        {preview && preview.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">
              Preview — {preview.length} row{preview.length !== 1 ? 's' : ''} detected
            </p>
            <div className="overflow-hidden rounded-lg ring-1 ring-surface-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-border bg-surface">
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">Name</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">Email</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">Gender</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {preview.slice(0, 10).map((row, i) => (
                    <tr key={i} className="bg-surface-card">
                      <td className="px-3 py-2 text-slate-300">{row.full_name || <span className="text-red-400 italic">missing</span>}</td>
                      <td className="px-3 py-2 text-slate-300">{row.email || <span className="text-red-400 italic">missing</span>}</td>
                      <td className="px-3 py-2 text-slate-400">{row.gender}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 10 && (
                <p className="border-t border-surface-border bg-surface px-3 py-2 text-xs text-slate-600">
                  … and {preview.length - 10} more rows
                </p>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="rounded-lg border border-surface-border bg-surface px-4 py-3 space-y-1">
            <p className="text-xs font-medium text-white mb-2">Import complete</p>
            <div className="flex gap-4 text-xs">
              <span className="text-accent-400">✓ {results.linked} linked</span>
              <span className="text-brand-300">✓ {results.provisional} invited</span>
              {results.skipped > 0 && <span className="text-slate-500">⚠ {results.skipped} skipped</span>}
            </div>
            {results.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {results.errors.map((err, i) => (
                  <li key={i} className="text-xs text-red-400">• {err}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handleImport}
            disabled={!preview || preview.length === 0 || importing}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {importing ? 'Importing…' : `Import ${preview?.length ?? 0} player${(preview?.length ?? 0) !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
