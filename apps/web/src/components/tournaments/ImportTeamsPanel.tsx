'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface ParsedRow {
  team_name: string;
  full_name: string;
  email: string;
  gender: string;
  dob?: string;
  owner_name?: string;
  is_captain?: string;
}

interface ImportResults {
  teamsCreated: number;
  linked: number;
  provisional: number;
  skipped: number;
  warnings: string[];
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

  const teamIdx = header.indexOf('team_name');
  const nameIdx = header.indexOf('full_name');
  const emailIdx = header.indexOf('email');
  const genderIdx = header.indexOf('gender');
  const dobIdx = header.indexOf('dob');
  const ownerIdx = header.indexOf('owner_name');
  const captainIdx = header.indexOf('is_captain');

  if (teamIdx === -1 || nameIdx === -1 || emailIdx === -1 || genderIdx === -1) {
    return { rows: [], headerError: 'CSV must include columns: team_name, full_name, email, gender' };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: ParsedRow = {
      team_name: cols[teamIdx] ?? '',
      full_name: cols[nameIdx] ?? '',
      email: cols[emailIdx] ?? '',
      gender: cols[genderIdx] ?? '',
    };
    if (dobIdx !== -1 && cols[dobIdx]) row.dob = cols[dobIdx];
    if (ownerIdx !== -1 && cols[ownerIdx]) row.owner_name = cols[ownerIdx];
    if (captainIdx !== -1 && cols[captainIdx]) row.is_captain = cols[captainIdx];
    if (row.team_name || row.full_name || row.email) rows.push(row);
  }

  return { rows, headerError: null };
}

const EXAMPLE_CSV = `team_name,full_name,email,gender
The Smashers,Alice Smith,alice@example.com,female
The Smashers,Bob Jones,bob@example.com,male`;

export function ImportTeamsPanel({ tournamentId, categoryId }: Props) {
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
    if (!text.trim()) { setPreview(null); setParseError(null); return; }
    const { rows, headerError } = parseCSV(text);
    if (headerError) { setParseError(headerError); setPreview(null); }
    else { setParseError(null); setPreview(rows); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleTextChange(ev.target?.result as string);
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    setResults(null);

    try {
      const res = await fetch('/api/teams/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: tournamentId, category_id: categoryId, rows: preview }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults({ teamsCreated: 0, linked: 0, provisional: 0, skipped: preview.length, warnings: [], errors: [data.error ?? 'Import failed'] });
      } else {
        setResults(data.results);
        setCsvText('');
        setPreview(null);
        router.refresh();
      }
    } catch {
      setResults({ teamsCreated: 0, linked: 0, provisional: 0, skipped: preview.length, warnings: [], errors: ['Network error — please try again'] });
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

  const teamCount = preview ? new Set(preview.map((r) => r.team_name)).size : 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-surface-border py-4 text-sm text-slate-500 hover:border-brand-500/50 hover:text-slate-300 transition-colors"
      >
        <span className="text-base">📋</span>
        Import teams via CSV
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
        <h3 className="text-sm font-semibold text-white">CSV import — teams</h3>
        <button onClick={() => { setOpen(false); handleReset(); }} className="text-slate-500 hover:text-slate-300 transition-colors text-sm">
          ✕ Close
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="rounded-lg bg-surface px-4 py-3 ring-1 ring-surface-border">
          <p className="text-xs font-medium text-slate-400 mb-1">Required columns</p>
          <p className="text-xs text-slate-500">
            <code className="text-brand-300">team_name</code>,{' '}
            <code className="text-brand-300">full_name</code>,{' '}
            <code className="text-brand-300">email</code>,{' '}
            <code className="text-brand-300">gender</code> (male / female / other)
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Optional: <code className="text-slate-400">dob</code>,{' '}
            <code className="text-slate-400">owner_name</code> (per team),{' '}
            <code className="text-slate-400">is_captain</code> (true/false — defaults to the team&apos;s first row)
          </p>
          <p className="text-xs text-slate-500 mt-2">
            One row per player — group rows by <code className="text-slate-400">team_name</code>.
            The first row for a team becomes its captain.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs text-slate-400 hover:border-brand-500/50 hover:text-slate-300 transition-colors">
            📁 Upload .csv file
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="sr-only" />
          </label>
          <span className="text-xs text-slate-400">or paste CSV below</span>
        </div>

        <div>
          <textarea
            value={csvText}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={6}
            placeholder={EXAMPLE_CSV}
            className="w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition resize-y"
          />
        </div>

        {parseError && (
          <div className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400">{parseError}</div>
        )}

        {preview && preview.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">
              Preview — {teamCount} team{teamCount !== 1 ? 's' : ''}, {preview.length} player row{preview.length !== 1 ? 's' : ''}
            </p>
            <div className="overflow-hidden rounded-lg ring-1 ring-surface-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-border bg-surface">
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">Team</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">Name</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">Email</th>
                    <th className="px-3 py-2 text-left text-slate-500 font-medium">Gender</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {preview.slice(0, 10).map((row, i) => (
                    <tr key={i} className="bg-surface-card">
                      <td className="px-3 py-2 text-slate-300">{row.team_name || <span className="text-red-400 italic">missing</span>}</td>
                      <td className="px-3 py-2 text-slate-300">{row.full_name || <span className="text-red-400 italic">missing</span>}</td>
                      <td className="px-3 py-2 text-slate-300">{row.email || <span className="text-red-400 italic">missing</span>}</td>
                      <td className="px-3 py-2 text-slate-400">{row.gender}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 10 && (
                <p className="border-t border-surface-border bg-surface px-3 py-2 text-xs text-slate-600">… and {preview.length - 10} more rows</p>
              )}
            </div>
          </div>
        )}

        {results && (
          <div className="rounded-lg border border-surface-border bg-surface px-4 py-3 space-y-1">
            <p className="text-xs font-medium text-white mb-2">Import complete</p>
            <div className="flex gap-4 text-xs">
              <span className="text-accent-400">✓ {results.teamsCreated} teams created</span>
              <span className="text-brand-300">✓ {results.provisional} invited</span>
              {results.skipped > 0 && <span className="text-slate-500">⚠ {results.skipped} skipped</span>}
            </div>
            {results.warnings.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {results.warnings.map((w, i) => <li key={i} className="text-xs text-amber-400">⚠ {w}</li>)}
              </ul>
            )}
            {results.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {results.errors.map((err, i) => <li key={i} className="text-xs text-red-400">• {err}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button onClick={handleReset} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Clear</button>
          <button
            onClick={handleImport}
            disabled={!preview || preview.length === 0 || importing}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {importing ? 'Importing…' : `Import ${teamCount} team${teamCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
