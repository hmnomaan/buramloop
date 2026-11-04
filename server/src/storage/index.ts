// // server/src/storage/index.ts
// import { ENTITY_AREA_FOLDER_MAP } from '@buramloop/shared';
// import { env } from '../config/env';
// import { LocalStorageProvider } from './local.provider';
// import { NextcloudStorageProvider } from './nextcloud.provider';
// import { StorageProvider } from './storage.types';

// let storageInstance: StorageProvider | null = null;

// export function getStorageProvider(): StorageProvider {
//   if (!storageInstance) {
//     if (env.STORAGE_PROVIDER === 'nextcloud') {
//       storageInstance = new NextcloudStorageProvider(
//         env.NC_URL || 'http://localhost:8080',
//         env.NC_USER || 'buram_service',
//         env.NC_APP_PASSWORD || '',
//         env.NC_ROOT || 'BuramLoop'
//       );
//     } else {
//       storageInstance = new LocalStorageProvider(
//         env.UPLOAD_DIR || './uploads',
//         env.NC_ROOT || 'BuramLoop'
//       );
//     }
//   }
//   return storageInstance;
// }

// export async function bootstrapStorageFolders(): Promise<void> {
//   const provider = getStorageProvider();
//   const folders = [...Object.values(ENTITY_AREA_FOLDER_MAP), 'Exports'];
//   await provider.bootstrapFolders(folders);
// }

// export * from './storage.types';


// comapare

import { env } from '../config/env';
import { LocalStorageProvider } from './local.provider';
import { NextcloudStorageProvider } from './nextcloud.provider';
import {
  CANONICAL_STORAGE_FOLDERS,
  StorageProvider,
} from './storage.types';

let storageInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (storageInstance) {
    return storageInstance;
  }

  if (env.STORAGE_PROVIDER === 'nextcloud') {
    storageInstance = new NextcloudStorageProvider(
      env.NC_URL || 'http://localhost:8080',
      env.NC_USER || 'buram_service',
      env.NC_APP_PASSWORD || '',
      env.NC_ROOT || 'BuramLoop',
    );
  } else {
    storageInstance = new LocalStorageProvider(
      env.UPLOAD_DIR || './uploads',
      env.NC_ROOT || 'BuramLoop',
    );
  }

  return storageInstance;
}

/**
 * Initialize all standard storage folders.
 * Kept under the original name for compatibility with existing callers.
 */
export async function bootstrapStorageFolders(): Promise<void> {
  const provider = getStorageProvider();
  await provider.bootstrapFolders(CANONICAL_STORAGE_FOLDERS);
}

/**
 * Alias for callers using the newer initialization name.
 */
export const initializeStorageHierarchy = bootstrapStorageFolders;

export * from './storage.types';
