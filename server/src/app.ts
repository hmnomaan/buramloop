// server/src/app.ts
import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { errorHandler } from './middlewares/error.middleware';
import { AppError } from './common/errors';
import { authenticate } from './middlewares/auth.middleware';
import { requireAdminOnly } from './middlewares/rbac.middleware';
import { masterRouter } from './modules/master/master.routes';
import { sourcingRouter } from './modules/sourcing/sourcing.routes';
import { stockRoutes } from './modules/stock/stock.routes';
import { getStorageProvider } from './storage';
import { attachmentRoutes } from './modules/attachment/attachment.routes';
import { warmRoomRouter } from './modules/warm-room/warm-room.routes';
import { batchRouter } from './modules/batch/batch.routes';
import { shipmentRouter } from './modules/shipment/shipment.routes';
import { processRouter } from './modules/process/process.routes';
import { exportRouter } from './modules/export/export.routes';
import { costRouter } from './modules/cost/cost.routes';
import { traceRouter } from './modules/trace/trace.routes';
import { notificationRouter } from './modules/notification/notification.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { ALL_MODELS } from './models';
import { IntegrityJobService } from './jobs/integrity.cron';

export function createApp(): Express {
    const app = express();
    // Step 5: Middleware setup
    app.use(helmet());
    app.use(
        cors({
            origin: env.CORS_ORIGIN,
            credentials: true,
        })
    );
    app.use(express.json({ limit: '5mb' })); // Limit JSON payload size to 5MB 
    app.use(cookieParser());

    // Health check endpoint (verifies MongoDB replica set status)
    app.get('/api/v1/health', (_req, res) => {
        const dbReady = mongoose.connection.readyState === 1;
        res.status(dbReady ? 200 : 503).json({
            ok: dbReady,
            service: 'buramloop-api',
            dbState: dbReady ? 'connected' : 'disconnected',
            storageProvider: env.STORAGE_PROVIDER,
            timestamp: new Date().toISOString(),
        });
    });

    app.get('/api/v1/health/storage', async (_req, res, next) => {
        try {
            const storage = getStorageProvider();
            const health = await storage.healthCheck();
            res.status(health.ok ? 200 : 503).json({ ok: health.ok, data: health });
        } catch (err) {
            next(err);
        }
    });

    app.get('/api/v1/health/full', authenticate, requireAdminOnly, async (_req, res, next) => {
        try {
            const dbReady = mongoose.connection.readyState === 1;
            const storage = getStorageProvider();
            const [storageHealth, integrityReport] = await Promise.all([
                storage.healthCheck(),
                IntegrityJobService.runFullIntegrityAudit(),
            ]);

            const collectionCounts: Record<string, number> = {};
            await Promise.all(
                ALL_MODELS.map(async (model) => {
                    collectionCounts[model.collection.collectionName] = await model.countDocuments();
                })
            );

            const overallOk =
                dbReady &&
                storageHealth.ok &&
                integrityReport.ledgerHealthy &&
                integrityReport.storageHealthy;

            res.status(overallOk ? 200 : 503).json({
                ok: overallOk,
                timestamp: new Date().toISOString(),
                database: {
                    connected: dbReady,
                    collectionsRegistered: ALL_MODELS.length,
                    collectionCounts,
                },
                storage: storageHealth,
                integrity: integrityReport,
            });
        } catch (err) {
            next(err);
        }
    });

    // API routes
    app.use('/api/v1/auth', authRouter);
    app.use('/api/v1/master', masterRouter); // Step 5b Master Data API
    app.use('/api/v1/sourcings', sourcingRouter); // Step 5c Sourcing & Purchase Gates API
    app.use('/api/v1/stock', stockRoutes);
    app.use('/api/v1/attachments', attachmentRoutes);
    // Mount Step 5f routes:
    app.use('/api/v1/batches', batchRouter);
    app.use('/api/v1/warm-room', warmRoomRouter);
    app.use('/api/v1/production/process', processRouter); // Step 5g Processing & Rework API
    app.use('/api/v1/shipments', shipmentRouter);         // Step 5h Release & Shipment LOT API
    app.use('/api/v1/costs', costRouter);     // Step 5i Admin Pricing, Margin & Nextcloud Cost Reports
    app.use('/api/v1/trace', traceRouter);    // Step 5j Forward/Backward Govt Traceability
    app.use('/api/v1/exports', exportRouter); // Step 5k Snapshot Exports & ExportLogs
    app.use('/api/v1/production/batches', batchRouter);
    app.use('/api/v1/notifications', notificationRouter);
    app.use('/api/v1/audit', auditRouter);

    // 404 handler
    app.use((req, _res, next) => {
        next(AppError.notFound(`Route ${req.method} ${req.originalUrl}`));
    });

    // Global error handler
    app.use(errorHandler);

    return app;
}
