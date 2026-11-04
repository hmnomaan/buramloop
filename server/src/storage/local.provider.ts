// server/src/storage/local.provider.ts
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { StorageHealthResult, StorageProvider, StoragePutResult, StorageStatResult } from './storage.types';

export class LocalStorageProvider implements StorageProvider {
  public readonly providerName = 'local' as const;
  private readonly baseDir: string;

  constructor(uploadDir: string, rootFolder = 'BuramLoop') {
    this.baseDir = path.resolve(process.cwd(), uploadDir, rootFolder);
  }

  private resolveSafePath(relativePath: string): string {
    const cleanRel = relativePath.replace(/^[/\\]+/, '').replace(/\.\./g, '');
    const resolved = path.resolve(this.baseDir, cleanRel);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error('Path traversal blocked by LocalStorageProvider');
    }
    return resolved;
  }

  async bootstrapFolders(subfolders: string[]): Promise<void> {
    await fsp.mkdir(this.baseDir, { recursive: true });
    for (const folder of subfolders) {
      await fsp.mkdir(this.resolveSafePath(folder), { recursive: true });
    }
  }

  async healthCheck(): Promise<StorageHealthResult> {
    const start = Date.now();
    try {
      await fsp.mkdir(this.baseDir, { recursive: true });
      await fsp.access(this.baseDir, fs.constants.R_OK | fs.constants.W_OK);
      return {
        ok: true,
        provider: 'local',
        rootPath: this.baseDir,
        latencyMs: Date.now() - start,
        details: 'Local filesystem storage R/W verified',
      };
    } catch (err: any) {
      return {
        ok: false,
        provider: 'local',
        rootPath: this.baseDir,
        latencyMs: Date.now() - start,
        details: err?.message || 'Local storage inaccessible',
      };
    }
  }

  async putObject(
    relativePath: string,
    buffer: Buffer,
    _mimeType: string,
    sha256: string
  ): Promise<StoragePutResult> {
    const fullPath = this.resolveSafePath(relativePath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, buffer);
    return {
      provider: 'local',
      path: relativePath.replace(/\\/g, '/'),
      etag: `"${sha256.slice(0, 32)}"`,
      sizeBytes: buffer.byteLength,
      sha256,
    };
  }

  async getObjectStream(relativePath: string) {
    const fullPath = this.resolveSafePath(relativePath);
    const stat = await fsp.stat(fullPath);
    return {
      stream: fs.createReadStream(fullPath),
      sizeBytes: stat.size,
    };
  }

  async statObject(relativePath: string): Promise<StorageStatResult> {
    try {
      const fullPath = this.resolveSafePath(relativePath);
      const stat = await fsp.stat(fullPath);
      return {
        exists: stat.isFile(),
        sizeBytes: stat.size,
      };
    } catch {
      return { exists: false };
    }
  }

  async deleteObject(relativePath: string): Promise<void> {
    try {
      const fullPath = this.resolveSafePath(relativePath);
      await fsp.unlink(fullPath);
    } catch {
      // Ignore if already absent during compensation
    }
  }
}