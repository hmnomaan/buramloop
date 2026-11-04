import { Readable } from 'stream';

/**
 * Supported storage backends for BURAMLOOP.
 */
export type StorageProviderName = 'nextcloud' | 'local';

/**
 * Result returned after successfully storing an object.
 */
export interface StoragePutResult {
  provider: StorageProviderName;
  /** Storage-relative path, not a public URL. */
  path: string;
  /** Provider-specific identifier, when available. */
  fileId?: string;
  /** Provider-specific entity tag, when available. */
  etag?: string;
  sizeBytes: number;
  /** SHA-256 hex digest of the stored content. */
  sha256: string;
}

/**
 * Result of checking whether an object exists.
 */
export interface StorageStatResult {
  exists: boolean;
  sizeBytes?: number;
  etag?: string;
}

/**
 * Result of a storage-provider health check.
 */
export interface StorageHealthResult {
  ok: boolean;
  provider: StorageProviderName;
  /** Configured storage root; avoid exposing credentials or sensitive URLs. */
  rootPath: string;
  latencyMs: number;
  details?: string;
}

/**
 * Standard top-level folders bootstrapped by the application.
 * Keep these names stable because other modules may persist paths beneath them.
 */
export const CANONICAL_STORAGE_FOLDERS = [
  'Sourcings',
  'Contracts',
  'IncomingLots',
  'Drums',
  'LabReports',
  'Batches',
  'ProcessSteps',
  'ReworkStocks',
  'Shipments',
  'AdminCostReports',
  'Exports',
] as const;

/**
 * Contract implemented by local and Nextcloud storage providers.
 */
export interface StorageProvider {
  readonly providerName: StorageProviderName;

  bootstrapFolders(subfolders: readonly string[]): Promise<void>;

  healthCheck(): Promise<StorageHealthResult>;

  putObject(
    relativePath: string,
    buffer: Buffer,
    mimeType: string,
    sha256: string,
  ): Promise<StoragePutResult>;

  getObjectStream(
    relativePath: string,
  ): Promise<{ stream: Readable; sizeBytes?: number }>;

  statObject(relativePath: string): Promise<StorageStatResult>;

  deleteObject(relativePath: string): Promise<void>;
}
