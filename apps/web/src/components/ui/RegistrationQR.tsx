'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

interface Props {
  url: string;
  label?: string;
}

export function RegistrationQR({ url, label }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        <span>⬛</span>
        {expanded ? 'Hide QR code' : 'Show QR code'}
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col items-center gap-3 rounded-xl bg-white p-5 ring-1 ring-surface-border w-fit">
          <QRCodeSVG
            value={url}
            size={160}
            bgColor="#ffffff"
            fgColor="#0f172a"
            level="M"
          />
          {label && (
            <p className="text-center text-xs text-slate-600 max-w-[160px] leading-snug">{label}</p>
          )}
          <p className="text-[10px] text-slate-400 text-center break-all max-w-[160px]">{url}</p>
        </div>
      )}
    </div>
  );
}
