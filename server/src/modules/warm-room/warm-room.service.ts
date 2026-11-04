// server/src/modules/warm-room/warm-room.service.ts
import { ClientSession, Types } from 'mongoose';
import {
  BatchModel,
  CabinetModel,
  DrumModel,
  NotificationModel,
  StockMovementModel,
} from '../../models';
import { WarmOutDestination } from '../../../../shared/src/schemas/production';
import { withTransaction } from '../../config/db';
import { AppError } from '../../common/errors';
import { recordAudit } from '../../common/audit.helper';

export interface CheckInDrumDto {
  cabinetCode: 'CAB-01' | 'CAB-02';
  slotNo: number; // 1..17
  drumId: string; // ObjectId, drumCode, or barcode
  batchId?: string; // ObjectId or processNo
  targetTempC?: number;
  warmingHours?: number; // 6, 12, 18, 24, 30, 36, 42, 48, or custom (1..120h)
  notes?: string;
}

export interface CheckOutDrumDto {
  cabinetCode: 'CAB-01' | 'CAB-02';
  slotNo: number;
  destination: WarmOutDestination; // 'FILTRATION' | 'WAREHOUSE'
  notes?: string;
}

export class WarmRoomService {
  /**
   * Returns both warm cabinets (CAB-01 & CAB-02, 2 x 17 = 34 slots / 9,860 kg)
   * with populated drum and batch telemetry [R5]
   */
  static async listCabinets() {
    const cabinets = await CabinetModel.find({ isActive: true })
      .populate('occupiedSlots.drumId', 'drumCode barcode country netKg status location incomingLotId reservedBatchId')
      .populate('occupiedSlots.batchId', 'processNo status plannedKg approvedKg')
      .sort({ code: 1 })
      .lean();

    return cabinets;
  }

  /**
   * Checks a drum into a specific slot (1..17) of CAB-01 or CAB-02 inside an ACID transaction [R5]
   */
  static async checkInDrum(
    data: CheckInDrumDto,
    userId: string,
    actorRole: string,
    reason: string
  ) {
    if (!Number.isInteger(data.slotNo) || data.slotNo < 1 || data.slotNo > 17) {
      throw AppError.badRequest('INVALID_SLOT_NO', 'Warm cabinet slotNo must be an integer between 1 and 17.');
    }

    const warmingHours = Number(data.warmingHours ?? 24);
    if (!Number.isFinite(warmingHours) || warmingHours < 1 || warmingHours > 120) {
      throw AppError.badRequest(
        'INVALID_WARMING_HOURS',
        'Warming duration must be between 1 and 120 hours (presets 6h..48h or custom).'
      );
    }

    const trimmedDrumRef = String(data.drumId ?? '').trim();
    if (!trimmedDrumRef) {
      throw AppError.badRequest('INVALID_DRUM_ID', 'A drum ID, drum code, or barcode is required.');
    }

    return withTransaction(async (session: ClientSession) => {
      const drumLookupFilter = Types.ObjectId.isValid(trimmedDrumRef)
        ? {
            $or: [
              { _id: new Types.ObjectId(trimmedDrumRef) },
              { drumCode: trimmedDrumRef.toUpperCase() },
              { barcode: trimmedDrumRef },
            ],
          }
        : {
            $or: [
              { drumCode: trimmedDrumRef.toUpperCase() },
              { barcode: trimmedDrumRef },
            ],
          };

      const [cabinet, drum] = await Promise.all([
        CabinetModel.findOne({ code: data.cabinetCode, isActive: true }).session(session),
        DrumModel.findOne(drumLookupFilter).session(session),
      ]);

      if (!cabinet) throw AppError.notFound('Warm cabinet', data.cabinetCode);
      if (!drum) throw AppError.notFound('Drum', trimmedDrumRef);

      if (!['Approved', 'InWarehouse', 'Reserved'].includes(drum.status)) {
        throw AppError.conflict(
          'DRUM_NOT_ELIGIBLE_FOR_WARM_ROOM',
          `Drum ${drum.drumCode} has status ${drum.status} and cannot enter the warm cabinet.`
        );
      }

      if (cabinet.occupiedSlots.length >= cabinet.capacityDrums) {
        throw AppError.conflict(
          'CABINET_CAPACITY_EXCEEDED',
          `Cabinet ${cabinet.code} is at full capacity (${cabinet.capacityDrums}/17 drums).`
        );
      }

      const slotTaken = cabinet.occupiedSlots.some((s) => s.slotNo === data.slotNo);
      if (slotTaken) {
        throw AppError.conflict(
          'CABINET_SLOT_OCCUPIED',
          `Slot ${data.slotNo} in ${cabinet.code} is already occupied.`
        );
      }

      const alreadyInAnyCabinet = await CabinetModel.findOne({
        'occupiedSlots.drumId': drum._id,
      }).session(session);
      if (alreadyInAnyCabinet) {
        throw AppError.conflict(
          'DRUM_ALREADY_IN_CABINET',
          `Drum ${drum.drumCode} is already checked into cabinet ${alreadyInAnyCabinet.code}.`
        );
      }

      const now = new Date();
      const readyAt = new Date(now.getTime() + warmingHours * 3600 * 1000);
      const actorObjectId = new Types.ObjectId(userId);

      let batchObjectId: Types.ObjectId | null = drum.reservedBatchId ?? null;
      if (data.batchId && String(data.batchId).trim()) {
        const batchRef = String(data.batchId).trim();
        const batchDoc = Types.ObjectId.isValid(batchRef)
          ? await BatchModel.findById(batchRef).session(session)
          : await BatchModel.findOne({ processNo: batchRef.toUpperCase() }).session(session);
        if (!batchDoc) {
          throw AppError.notFound('Batch', batchRef);
        }
        batchObjectId = batchDoc._id;
      }

      const trimmedNotes = data.notes?.trim() || undefined;

      cabinet.occupiedSlots.push({
        slotNo: data.slotNo,
        drumId: drum._id,
        batchId: batchObjectId,
        checkedInAt: now,
        readyAt,
        inTempC: data.targetTempC ?? cabinet.targetTempC ?? 45,
        warmingHours,
        notes: trimmedNotes,
        checkedInBy: actorObjectId,
      });
      await cabinet.save({ session });

      const fromStatus = drum.status;
      const fromLocation = drum.location;
      drum.status = 'InWarmRoom';
      drum.location = 'WarmRoom';
      if (batchObjectId && !drum.reservedBatchId) {
        drum.reservedBatchId = batchObjectId;
      }
      await drum.save({ session });

      if (batchObjectId) {
        const batch = await BatchModel.findById(batchObjectId).session(session);
        if (batch && batch.status === 'RESERVED') {
          batch.transitionTo('WARMING', actorObjectId, reason);
          batch.readyAt = readyAt;
          await batch.save({ session });
        }
      }

      await StockMovementModel.create(
        [
          {
            movementType: 'WARM_IN',
            drumId: drum._id,
            incomingLotId: drum.incomingLotId,
            materialId: drum.materialId,
            country: drum.country,
            fromStatus,
            toStatus: 'InWarmRoom',
            fromLocation,
            toLocation: 'WarmRoom',
            signedKg: 0,
            batchId: batchObjectId,
            cabinetId: cabinet._id,
            reason: `Checked into ${cabinet.code} Slot #${data.slotNo} (${warmingHours}h)${trimmedNotes ? ` [Notes: ${trimmedNotes}]` : ''}: ${reason}`,
            performedBy: actorObjectId,
          },
        ],
        { session }
      );

      await recordAudit({
        actorId: userId,
        actorRole,
        module: 'warmroom',
        action: 'WARM_IN',
        entityType: 'CABINET',
        entityId: cabinet._id,
        entityRef: `${cabinet.code}#${data.slotNo}`,
        after: {
          cabinetCode: cabinet.code,
          slotNo: data.slotNo,
          drumCode: drum.drumCode,
          warmingHours,
          notes: trimmedNotes,
          readyAt,
        },
        reason,
        session,
      });

      return cabinet.toObject();
    });
  }

  /**
   * Checks a drum out of a warm cabinet slot to either FILTRATION or WAREHOUSE [R5]
   */
  static async checkOutDrum(
    data: CheckOutDrumDto,
    userId: string,
    actorRole: string,
    reason: string
  ) {
    return withTransaction(async (session: ClientSession) => {
      const cabinet = await CabinetModel.findOne({
        code: data.cabinetCode,
        isActive: true,
      }).session(session);
      if (!cabinet) throw AppError.notFound('Warm cabinet', data.cabinetCode);

      const slotEntry = cabinet.occupiedSlots.find((s) => s.slotNo === data.slotNo);
      if (!slotEntry) {
        throw AppError.notFound('Occupied slot', `${data.cabinetCode}#${data.slotNo}`);
      }

      const drum = await DrumModel.findById(slotEntry.drumId).session(session);
      if (!drum) throw AppError.notFound('Drum in slot', slotEntry.drumId.toHexString());

      const actorObjectId = new Types.ObjectId(userId);
      const fromStatus = drum.status;
      const fromLocation = drum.location;

      if (data.destination === 'FILTRATION') {
        drum.status = 'InBatch';
        drum.location = 'Filtration';
        if (!drum.reservedBatchId && slotEntry.batchId) {
          drum.reservedBatchId = slotEntry.batchId;
        }
      } else {
        drum.status = drum.reservedBatchId ? 'Reserved' : 'Approved';
        drum.location = 'Warehouse';
      }
      await drum.save({ session });

      cabinet.occupiedSlots = cabinet.occupiedSlots.filter(
        (s) => s.slotNo !== data.slotNo
      );
      await cabinet.save({ session });

      const cleanNotes = data.notes?.trim() ? ` | Notes: ${data.notes.trim()}` : '';

      await StockMovementModel.create(
        [
          {
            movementType:
              data.destination === 'FILTRATION'
                ? 'WARM_OUT_FILTRATION'
                : 'WARM_OUT_WAREHOUSE',
            drumId: drum._id,
            incomingLotId: drum.incomingLotId,
            materialId: drum.materialId,
            country: drum.country,
            fromStatus,
            toStatus: drum.status,
            fromLocation,
            toLocation: drum.location,
            signedKg: 0,
            batchId: slotEntry.batchId ?? drum.reservedBatchId ?? null,
            cabinetId: cabinet._id,
            reason: `Checked out of ${cabinet.code} Slot #${data.slotNo} to ${data.destination}: ${reason}${cleanNotes}`,
            performedBy: actorObjectId,
          },
        ],
        { session }
      );

      // Emit notification if drum was checked out before its 24h minimum conditioning time
      if (new Date() < slotEntry.readyAt && data.destination === 'FILTRATION') {
        await NotificationModel.create(
          [
            {
              type: 'WARM_READY',
              severity: 'WARNING',
              title: `Early Warm-Out on ${drum.drumCode} (${cabinet.code}#${data.slotNo})`,
              message: `Drum ${drum.drumCode} routed to FILTRATION prior to target readyAt (${slotEntry.readyAt.toISOString()}). Reason: ${reason}${cleanNotes}`,
              targetRoles: ['Admin', 'Management', 'QA', 'Production'],
              entityType: 'DRUM',
              entityId: drum._id,
            },
          ],
          { session }
        );
      }

      await recordAudit({
        actorId: userId,
        actorRole,
        module: 'warmroom',
        action: `WARM_OUT_${data.destination}`,
        entityType: 'CABINET',
        entityId: cabinet._id,
        entityRef: `${cabinet.code}#${data.slotNo}`,
        after: {
          cabinetCode: cabinet.code,
          slotNo: data.slotNo,
          drumCode: drum.drumCode,
          destination: data.destination,
          ...(data.notes?.trim() ? { notes: data.notes.trim() } : {}),
        },
        reason,
        session,
      });

      return { cabinet: cabinet.toObject(), drum: drum.toObject() };
    });
  }
}