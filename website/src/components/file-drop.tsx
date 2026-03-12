"use client";

import { useCallback, useState, useRef } from "react";
import { formatFileSize } from "@/lib/occ";

interface FileDropProps {
  onFile?: (file: File) => void;
  file?: File | null;
  onClear?: () => void;
  /** Multi-file mode */
  multiple?: boolean;
  onFiles?: (files: File[]) => void;
  files?: File[];
  onRemoveFile?: (index: number) => void;
  onClearAll?: () => void;
  disabled?: boolean;
  accept?: string;
  hint?: string;
}

export function FileDrop({
  onFile,
  file,
  onClear,
  multiple,
  onFiles,
  files,
  onRemoveFile,
  onClearAll,
  disabled,
  accept,
  hint,
}: FileDropProps) {
  const [dragover, setDragover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasFiles = multiple ? (files && files.length > 0) : !!file;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragover(false);
      if (disabled) return;
      if (multiple && onFiles) {
        const dropped = Array.from(e.dataTransfer.files);
        if (dropped.length) onFiles(dropped);
      } else if (onFile && e.dataTransfer.files.length) {
        onFile(e.dataTransfer.files[0]);
      }
    },
    [onFile, onFiles, multiple, disabled]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return;
      if (multiple && onFiles) {
        onFiles(Array.from(e.target.files));
      } else if (onFile) {
        onFile(e.target.files[0]);
      }
      // Reset input so the same file(s) can be re-selected
      e.target.value = "";
    },
    [onFile, onFiles, multiple]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && !hasFiles && inputRef.current?.click()}
      className={`
        h-full relative rounded-lg border-2 border-dashed transition-all cursor-pointer min-h-[160px] flex items-center
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        ${dragover ? "border-text/30 bg-text/5" : hasFiles ? "border-border bg-bg-elevated" : "border-border-subtle hover:border-border bg-bg-elevated/50 hover:bg-bg-elevated"}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />

      {/* ── Multi-file mode: file list ── */}
      {multiple && files && files.length > 0 ? (
        <div className="w-full px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-text-tertiary font-medium">
              {files.length} file{files.length !== 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                className="text-xs text-text-secondary hover:text-text transition-colors"
                disabled={disabled}
              >
                Add more
              </button>
              {onClearAll && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClearAll(); }}
                  className="text-xs text-text-tertiary hover:text-text transition-colors"
                  disabled={disabled}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-bg-subtle/50 group">
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-text truncate block">{f.name}</span>
                  <span className="text-xs text-text-tertiary">{formatFileSize(f.size)}</span>
                </div>
                {onRemoveFile && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveFile(i); }}
                    className="text-xs text-text-tertiary hover:text-error transition-colors opacity-0 group-hover:opacity-100 ml-2 shrink-0"
                    disabled={disabled}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : /* ── Single-file mode: existing behavior ── */
      file ? (
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
              onClear?.();
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
            {multiple
              ? <>Drop files here or <span className="text-text font-medium">browse</span></>
              : <>Drop a file here or <span className="text-text font-medium">browse</span></>
            }
          </div>
          <div className="text-xs text-text-tertiary mt-1">
            {hint || "Any file type — hashed locally in your browser"}
          </div>
        </div>
      )}
    </div>
  );
}
