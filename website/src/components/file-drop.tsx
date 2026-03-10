"use client";

import { useCallback, useState, useRef } from "react";
import { formatFileSize } from "@/lib/occ";

interface FileDropProps {
  onFile: (file: File) => void;
  file: File | null;
  onClear: () => void;
  disabled?: boolean;
}

export function FileDrop({ onFile, file, onClear, disabled }: FileDropProps) {
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragover(false);
      if (disabled) return;
      if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]);
    },
    [onFile, disabled]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && !file && inputRef.current?.click()}
      className={`
        h-full relative rounded-lg border-2 border-dashed transition-all cursor-pointer min-h-[160px] flex items-center
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        ${dragover ? "border-text/30 bg-text/5" : file ? "border-border bg-bg-elevated" : "border-border-subtle hover:border-border bg-bg-elevated/50 hover:bg-bg-elevated"}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFile(e.target.files[0]);
        }}
        disabled={disabled}
      />

      {file ? (
        <div className="flex items-center justify-between px-6 py-5 w-full">
          <div>
            <div className="text-sm font-medium text-text">{file.name}</div>
            <div className="text-xs text-text-tertiary mt-0.5">
              {formatFileSize(file.size)}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="text-xs text-text-tertiary hover:text-text transition-colors"
            disabled={disabled}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center py-12 px-6 w-full">
          <div className="w-10 h-10 rounded-lg border border-border-subtle bg-bg-subtle flex items-center justify-center mb-4">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
              <path d="M10 3v10M6 7l4-4 4 4" />
              <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" />
            </svg>
          </div>
          <div className="text-sm text-text-secondary">
            Drop a file here or <span className="text-text font-medium">browse</span>
          </div>
          <div className="text-xs text-text-tertiary mt-1">
            Any file type — hashed locally in your browser
          </div>
        </div>
      )}
    </div>
  );
}
