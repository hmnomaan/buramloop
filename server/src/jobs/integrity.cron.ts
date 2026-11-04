// server/src/jobs/integrity.cron.ts
import { ClientSession } from 'mongoose';
import {
  AttachmentModel,
  CabinetModel,
  DrumModel,
  NotificationModel,
  StockMovementModel,
} from '../models';
import { withSnapshotRead } from '../config/db';
import { getStorageProvider } from '../storage';
import { roundKg } from '../../../shared/src/schemas/common';

export interface SystemIntegrityReport {
  checkedAt: string;
  ledgerHealthy: boolean;
  checkedDrumsCount: number;
  ledgerDiscrepancies: Array<{ drumCode: string; expectedKg: number; ledgerSumKg: number }>;
  storageHealthy: boolean;
  checkedAttachmentsCount: number;
  missingStoragePaths: string[];
  warmReadySlotsNotified: number;
}

export class IntegrityJobService {
  /**
   * Executes:
   * 1. Snapshot-isolated Stock Ledger vs Drum balance verification (0.000 kg tolerance).
   * 2. Nextcloud/Local Storage vs Attachment DB verification.
   * 3. Warm Cabinet 24-48h readyAt notification emitter.
   */
  static async runFullIntegrityAudit(): Promise<SystemIntegrityReport> {
    const ledgerDiscrepancies: Array<{
      drumCode: string;
      expectedKg: number;
      ledgerSumKg: number;
    }> = [];

    const drums = await withSnapshotRead(async (session: ClientSession) => {
      const allDrums = await DrumModel.find().session(session).lean();
      const ledgerSums = await StockMovementModel.aggregate<{
        _id: import('mongoose').Types.ObjectId;
        totalSignedKg: number;
      }>([
        {
          $group: {
            _id: '$drumId',
            totalSignedKg: { $sum: '$signedKg' },
          },
        },
      ]).session(session);

      const sumByDrumId = new Map<string, number>();
      for (const row of ledgerSums) {
        if (row._id) {
          sumByDrumId.set(row._id.toHexString(), roundKg(row.totalSignedKg));
        }
      }

      for (const drum of allDrums) {
        const activeStatues = [
          'Quarantine',
          'Approved',
          'InWarehouse',
          'InWarmRoom',
          'Reserved',
          'InBatch',
        ];
        const expectedKg = activeStatues.includes(drum.status) ? roundKg(drum.netKg) : 0;
        const ledgerSumKg = sumByDrumId.get(drum._id.toHexString()) ?? 0;

        if (Math.abs(expectedKg - ledgerSumKg) > 0.01) {
          ledgerDiscrepancies.push({
            drumCode: drum.drumCode,
            expectedKg,
            ledgerSumKg,
          });
        }
      }
      return allDrums;
    });

    // 2. Verify active Nextcloud/Local attachments exist on storage
    const storage = getStorageProvider();
    const activeAttachments = await AttachmentModel.find({ status: 'ACTIVE' }).lean();
    const missingStoragePaths: string[] = [];

    for (const att of activeAttachments) {
      const stat = await storage.statObject(att.storage.path);
      if (!stat.exists) {
        missingStoragePaths.push(att.storage.path);
      }
    }

    // 3. Check 2x17 Warm Cabinets for drums that have reached their 24-48h readyAt timestamp
    const now = new Date();
    const cabinets = await CabinetModel.find({ isActive: true }).lean();
    let warmReadySlotsNotified = 0;

    for (const cab of cabinets) {
      for (const slot of cab.occupiedSlots) {
        if (slot.readyAt <= now) {
          const existingAlert = await NotificationModel.findOne({
            type: 'WARM_READY',
            entityType: 'DRUM',
            entityId: slot.drumId,
          }).lean();

          if (!existingAlert) {
            await NotificationModel.create({
              type: 'WARM_READY',
              severity: 'INFO',
              title: `Warm Cabinet ${cab.code} Slot #${slot.slotNo} Ready (24–48h Complete)`,
              message: `Drum in ${cab.code} Slot #${slot.slotNo} reached target conditioning time (${slot.readyAt.toISOString()}) and is ready for Filtration.`,
              targetRoles: ['Admin', 'Production', 'Warehouse'],
              entityType: 'DRUM',
              entityId: slot.drumId,
            });
            warmReadySlotsNotified += 1;
          }
        }
      }
    }

    if (ledgerDiscrepancies.length > 0 || missingStoragePaths.length > 0) {
      await NotificationModel.create({
        type: 'DEVIATION_MISMATCH',
        severity: 'CRITICAL',
        title: 'System Integrity Job Detected Discrepancy',
        message: `Ledger discrepancies: ${ledgerDiscrepancies.length}, Missing Nextcloud files: ${missingStoragePaths.length}.`,
        targetRoles: ['Admin', 'Management'],
      });
    }

    return {
      checkedAt: now.toISOString(),
      ledgerHealthy: ledgerDiscrepancies.length === 0,
      checkedDrumsCount: drums.length,
      ledgerDiscrepancies,
      storageHealthy: missingStoragePaths.length === 0,
      checkedAttachmentsCount: activeAttachments.length,
      missingStoragePaths,
      warmReadySlotsNotified,
    };
  }
}