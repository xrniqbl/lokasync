import { memo, useState, useEffect } from "react";
import { Download, FileText, FileImage, FileCode, FileSpreadsheet } from "lucide-react";
import * as storage from "../../utils/storage";

interface FilePreviewProps {
  fileUrl: string;
  fileName: string;
  fileType: string | null;
  workspaceId: string;
}

export const FilePreview = memo(function FilePreview({ fileUrl, fileName, fileType, workspaceId }: FilePreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = fileType?.startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    storage.getDownloadUrl(fileUrl, workspaceId, 300)
      .then((signed) => { if (!cancelled) setUrl(signed); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fileUrl, workspaceId]);

  if (isImage && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img
          src={url}
          alt={fileName}
          className="max-w-[300px] max-h-[200px] rounded-lg object-cover border border-neutral-800 cursor-pointer hover:opacity-90 transition-opacity"
          loading="lazy"
        />
      </a>
    );
  }

  const icon = fileType?.includes("pdf") ? <FileText size={16} />
    : fileType?.includes("image") ? <FileImage size={16} />
    : fileType?.includes("sheet") || fileType?.includes("csv") ? <FileSpreadsheet size={16} />
    : fileType?.includes("code") || fileType?.includes("json") ? <FileCode size={16} />
    : <FileText size={16} />;

  return (
    <div className="flex items-center gap-2 mt-1 bg-neutral-800/40 border border-neutral-800 rounded-lg px-3 py-2 max-w-[280px]">
      <div className="text-neutral-400 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-neutral-300 truncate">{fileName}</div>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-500 hover:text-neutral-300 transition-colors shrink-0"
          download={fileName}
        >
          <Download size={14} />
        </a>
      )}
    </div>
  );
});
