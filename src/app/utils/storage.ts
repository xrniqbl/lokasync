import { supabase } from "./supabase";

const BUCKET = "files";

/** Max file size: 50 MB (Supabase Storage default limit). */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Blocked MIME types — executables, scripts, and server-side code. */
const BLOCKED_TYPES = new Set([
  // Executables
  "application/x-msdownload",
  "application/x-executable",
  "application/x-msdos-program",
  "application/vnd.microsoft.portable-executable",
  // Scripts
  "application/javascript",
  "text/javascript",
  "application/x-sh",
  "application/x-bat",
  "application/x-python-code",
  "application/x-perl",
  "application/x-httpd-php",
  // HTML (prevents stored XSS if served with wrong Content-Type)
  "text/html",
  "application/xhtml+xml",
]);

function pathFor(workspaceId: string, name: string) {
  return `${workspaceId}/${encodeURIComponent(name)}`;
}

export interface StorageUploadResult {
  path: string;
  fullPath: string;
}

/**
 * Validate a file before upload. Throws a user-friendly error on failure.
 */
function validateFile(file: File) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File is too large (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB)`);
  }
  if (BLOCKED_TYPES.has(file.type)) {
    throw new Error(`File type "${file.type}" is not allowed for security reasons`);
  }
}

/**
 * Upload a file to the workspace's Supabase Storage bucket.
 * Requires the `files` bucket to exist and RLS to permit authenticated uploads.
 */
export async function uploadFile(
  file: File,
  workspaceId: string,
): Promise<StorageUploadResult> {
  validateFile(file);
  const path = pathFor(workspaceId, file.name);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });
  if (error) throw error;
  return { path: data.path, fullPath: data.fullPath };
}

/**
 * Create a short-lived signed URL for downloading a file.
 */
export async function getDownloadUrl(
  fileName: string,
  workspaceId: string,
  expiresInSeconds = 60,
): Promise<string> {
  const path = pathFor(workspaceId, fileName);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Download the file binary directly via the authenticated client.
 */
export async function downloadFile(
  fileName: string,
  workspaceId: string,
): Promise<Blob> {
  const path = pathFor(workspaceId, fileName);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data;
}

/**
 * Delete the stored object for a file.
 */
export async function deleteStoredFile(
  fileName: string,
  workspaceId: string,
): Promise<void> {
  const path = pathFor(workspaceId, fileName);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Upload a file for chat. Uses a `chat/` subdirectory to avoid collision
 * with regular workspace files. Returns the storage path (stored as file_url).
 */
export async function uploadChatFile(
  file: File,
  workspaceId: string,
): Promise<StorageUploadResult> {
  validateFile(file);
  const uniqueName = `${crypto.randomUUID()}-${file.name}`;
  const path = `${workspaceId}/chat/${encodeURIComponent(uniqueName)}`;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false });
  if (error) throw error;
  return { path: data.path, fullPath: data.fullPath };
}
