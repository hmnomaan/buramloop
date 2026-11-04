
import http from 'http';
import mongoose from 'mongoose';

import { env } from './config/env';
import { connectDatabase } from './config/db';
import { createApp } from './app';
import { initializeStorageHierarchy } from './storage';
import { IntegrityJobService } from './jobs/integrity.cron';

const INTEGRITY_INTERVAL_MS = 15 * 60 * 1000;
const SHUTDOWN_TIMEOUT_MS = 15_000;

async function bootstrap(): Promise<void> {
  await connectDatabase();

  try {
    await initializeStorageHierarchy();

    console.log(
      `[STORAGE] Initialized ${env.STORAGE_PROVIDER} folder hierarchy`,
    );
  } catch (err) {
    console.error(
      '[STORAGE] Could not initialize storage folders:',
      err,
    );

    // Degraded startup is allowed here.
    // Remove this catch-and-continue behavior if storage is mandatory.
  }

  const app = createApp();
  const server = http.createServer(app);

  let shuttingDown = false;
  let auditRunning = false;

  const integrityInterval = setInterval(() => {
    if (shuttingDown || auditRunning) {
      return;
    }

    auditRunning = true;

    void IntegrityJobService.runFullIntegrityAudit()
      .catch((err) => {
        console.error(
          '[INTEGRITY_JOB] Scheduled audit failed:',
          err,
        );
      })
      .finally(() => {
        auditRunning = false;
      });
  }, INTEGRITY_INTERVAL_MS);

  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(
      `[BURAMLOOP_API] Listening on http://0.0.0.0:${env.PORT}/api/v1 (${env.NODE_ENV})`,
    );
  });

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.log(
      `[BURAMLOOP_API] Received ${signal}. Shutting down gracefully...`,
    );

    clearInterval(integrityInterval);

    const forceExitTimer = setTimeout(() => {
      console.error(
        '[BURAMLOOP_API] Shutdown timed out; forcing exit.',
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceExitTimer.unref();

    server.close((serverError) => {
      void (async () => {
        try {
          await mongoose.connection.close();

          if (serverError) {
            throw serverError;
          }

          clearTimeout(forceExitTimer);

          console.log('[BURAMLOOP_API] Shutdown complete.');
          process.exitCode = 0;
        } catch (err) {
          clearTimeout(forceExitTimer);

          console.error(
            '[BURAMLOOP_API] Error during shutdown:',
            err,
          );

          process.exitCode = 1;
        }
      })();
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err: unknown) => {
  console.error('[BOOTSTRAP] Fatal startup failure:', err);
  process.exitCode = 1;
});
