import { Readable } from 'stream';
import {
  StorageHealthResult,
  StorageProvider,
  StoragePutResult,
  StorageStatResult,
} from './storage.types';

const EXISTING_DIRECTORY_STATUSES = new Set([200, 201, 405]);
const PROPFIND_SUCCESS_STATUSES = new Set([200, 207]);

export class NextcloudStorageProvider implements StorageProvider {
  public readonly providerName = 'nextcloud' as const;
  private readonly webdavBaseUrl: string;
  private readonly authHeader: string;
  private readonly rootFolder: string;

  constructor(ncUrl: string, ncUser: string, ncAppPassword: string, rootFolder = 'BuramLoop') {
    const trimmedBase = ncUrl.replace(/\/+$/, '');
    const rootSegments = rootFolder.replace(/\\/g, '/').split('/').filter(Boolean);
    if (rootSegments.some((segment) => segment === '.' || segment === '..')) {
      throw new Error('Storage root cannot contain "." or ".." segments.');
    }
    this.rootFolder = rootSegments.join('/');
    this.webdavBaseUrl = `${trimmedBase}/remote.php/dav/files/${encodeURIComponent(ncUser)}`;
    this.authHeader = `Basic ${Buffer.from(`${ncUser}:${ncAppPassword}`, 'utf-8').toString('base64')}`;
  }

  private normalizePath(path: string): string {
    const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new Error('Storage paths cannot contain "." or ".." segments.');
    }

    const rootSegments = this.rootFolder
      ? this.rootFolder.split('/').filter(Boolean)
      : [];
    const includesRoot =
      rootSegments.length > 0 &&
      rootSegments.every((segment, index) => segment.toLowerCase() === segments[index]?.toLowerCase());
    const relativeSegments = includesRoot ? segments.slice(rootSegments.length) : segments;
    return relativeSegments.join('/');
  }

  private buildUrl(relativePath = ''): string {
    const normalizedPath = this.normalizePath(relativePath);
    const fullPath = [this.rootFolder, normalizedPath].filter(Boolean).join('/');
    const encodedSegments = fullPath
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${this.webdavBaseUrl}/${encodedSegments}`;
  }

  private async ensureDirectoryUrl(dirUrl: string): Promise<void> {
    const res = await fetch(dirUrl, {
      method: 'MKCOL',
      headers: { Authorization: this.authHeader },
    });
    if (!EXISTING_DIRECTORY_STATUSES.has(res.status)) {
      throw new Error(`Nextcloud WebDAV MKCOL failed with HTTP ${res.status}`);
    }
  }

  private async ensureDirectoryHierarchy(dirRelativePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(dirRelativePath);
    await this.ensureDirectoryUrl(this.buildUrl(''));

    let currentPath = '';
    for (const segment of normalizedPath.split('/').filter(Boolean)) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      await this.ensureDirectoryUrl(this.buildUrl(currentPath));
    }
  }

  async bootstrapFolders(subfolders: readonly string[]): Promise<void> {
    await this.ensureDirectoryUrl(this.buildUrl(''));
    for (const folder of subfolders) {
      await this.ensureDirectoryHierarchy(folder);
    }
  }

  async healthCheck(): Promise<StorageHealthResult> {
    const start = Date.now();
    try {
      const res = await fetch(this.buildUrl(''), {
        method: 'PROPFIND',
        headers: {
          Authorization: this.authHeader,
          Depth: '0',
        },
      });

      if (res.status === 404) {
        await this.ensureDirectoryUrl(this.buildUrl(''));
      } else if (!PROPFIND_SUCCESS_STATUSES.has(res.status)) {
        return {
          ok: false,
          provider: 'nextcloud',
          rootPath: this.rootFolder,
          latencyMs: Date.now() - start,
          details: `Nextcloud WebDAV PROPFIND returned HTTP ${res.status}`,
        };
      }

      return {
        ok: true,
        provider: 'nextcloud',
        rootPath: this.rootFolder,
        latencyMs: Date.now() - start,
        details: 'Nextcloud WebDAV PROPFIND healthy',
      };
    } catch (err) {
      return {
        ok: false,
        provider: 'nextcloud',
        rootPath: this.rootFolder,
        latencyMs: Date.now() - start,
        details: err instanceof Error ? err.message : 'Nextcloud WebDAV unreachable',
      };
    }
  }

  async putObject(
    relativePath: string,
    buffer: Buffer,
    mimeType: string,
    sha256: string
  ): Promise<StoragePutResult> {
    const normalizedPath = this.normalizePath(relativePath);
    const lastSlash = normalizedPath.lastIndexOf('/');
    const parentPath = lastSlash > 0 ? normalizedPath.slice(0, lastSlash) : '';
    await this.ensureDirectoryHierarchy(parentPath);

    const res = await fetch(this.buildUrl(normalizedPath), {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': mimeType || 'application/octet-stream',
        'OC-Checksum': `SHA256:${sha256}`,
      },
      body: buffer,
    });

    if (!res.ok) {
      throw new Error(`Nextcloud WebDAV PUT failed with HTTP ${res.status}`);
    }

    return {
      provider: 'nextcloud',
      path: [this.rootFolder, normalizedPath].filter(Boolean).join('/'),
      fileId: res.headers.get('oc-fileid') || undefined,
      etag: res.headers.get('etag') || undefined,
      sizeBytes: buffer.byteLength,
      sha256,
    };
  }

  async getObjectStream(relativePath: string): Promise<{ stream: Readable; sizeBytes?: number }> {
    const res = await fetch(this.buildUrl(relativePath), {
      method: 'GET',
      headers: { Authorization: this.authHeader },
    });

    if (!res.ok || !res.body) {
      throw new Error(`Nextcloud WebDAV GET failed with HTTP ${res.status}`);
    }

    const contentLength = res.headers.get('content-length');
    return {
      stream: Readable.fromWeb(res.body as import('stream/web').ReadableStream),
      sizeBytes: contentLength ? Number(contentLength) : undefined,
    };
  }

  async statObject(relativePath: string): Promise<StorageStatResult> {
    const res = await fetch(this.buildUrl(relativePath), {
      method: 'PROPFIND',
      headers: {
        Authorization: this.authHeader,
        Depth: '0',
      },
    });
    if (res.status === 404) {
      return { exists: false };
    }
    if (!PROPFIND_SUCCESS_STATUSES.has(res.status)) {
      throw new Error(`Nextcloud WebDAV PROPFIND failed with HTTP ${res.status}`);
    }

    return {
      exists: true,
      etag: res.headers.get('etag') || undefined,
    };
  }

  async deleteObject(relativePath: string): Promise<void> {
    const targetUrl = this.buildUrl(relativePath);
    try {
      const res = await fetch(targetUrl, {
        method: 'DELETE',
        headers: { Authorization: this.authHeader },
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Nextcloud WebDAV DELETE failed with HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(
        '[STORAGE_DELETE_CLEANUP_FAILED]',
        err instanceof Error ? err.message : 'Nextcloud WebDAV DELETE failed'
      );
    }
  }
}
