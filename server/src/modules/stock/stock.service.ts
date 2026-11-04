// server/src/modules/stock/stock.service.ts
import mongoose, { ClientSession } from 'mongoose';
import {
  resolveReceivedLotQuantities,
  type ReceiveIncomingLotInput,
} from '../../../../shared/src/schemas/stock';
import { roundKg } from '../../../../shared/src/schemas/common';
import { roundEur } from '../../../../shared/src/schemas/origin-blend.js';
import {
  ContractModel,
  DrumModel,
  IncomingLotModel,
  LabReportModel,
  MaterialModel,
  NotificationModel,
  QualityGradeModel,
  SourcingModel,
  StockMovementModel,
  StockPackageModel,
  StockThresholdModel,
  SupplierModel,
  getNextSequence,
} from '../../models';
import { withSnapshotRead, withTransaction } from '../../config/db';
import { AppError } from '../../common/errors';
import { AuditActor, recordAudit } from '../../common/audit.helper';
import { canRoleViewPrices } from '../../common/price-strip.helper';

export type ReceiveLotInput = ReceiveIncomingLotInput;

export interface ReviewLotInput {
  incomingLotId: string;
  decision: 'PASSED' | 'FAILED';
  qualityGradeId?: string | null;
  labReport: {
    labName?: string;
    reportNo: string;
    moisturePct?: number;
    hmfMgPerKg?: number;
    diastaseDn?: number;
    c4SugarPassed?: boolean;
    nmrPassed?: boolean;
    attachmentId?: string | null;
    notes?: string;
  };
  reason: string;
}

export interface ReturnMismatchInput {
  incomingLotId: string;
  mismatchDetails: string;
  reason: string;
}

interface IncomingLotUsage {
  quarantineDrums: number;
  availableDrums: number;
  packageCount: number;
  availableKg: number;
  availableQuantity: number;
  quantityUnit: string;
  inWarmOrReservedDrums: number;
  consumedDrums: number;
  consumedKg: number;
  consumedQuantity: number;
  rejectedDrums: number;
}

type IncomingLotWithUsage = Record<string, unknown> & { usage: IncomingLotUsage };

export class StockService {
  /**
   * Helper: Evaluate low-stock threshold for (materialId, country) and emit notification if breached
   */
  static async evaluateLowStockThreshold(
    materialId: mongoose.Types.ObjectId | string,
    country: string,
    session?: ClientSession
  ) {
    const threshold = await StockThresholdModel.findOne({
      materialId,
      country: country.toUpperCase(),
      isActive: true,
    }).session(session || null);

    if (!threshold) return;

    const approvedAgg = await DrumModel.aggregate([
      {
        $match: {
          materialId: new mongoose.Types.ObjectId(String(materialId)),
          country: country.toUpperCase(),
          status: { $in: ['Approved', 'InWarehouse'] },
        },
      },
      {
        $group: {
          _id: null,
          freeKg: { $sum: '$netKg' },
          freeDrums: { $sum: 1 },
        },
      },
    ]).session(session || null);

    const freeKg = roundKg(approvedAgg[0]?.freeKg || 0);
    const freeDrums = approvedAgg[0]?.freeDrums || 0;

    if (freeKg < threshold.minApprovedFreeKg) {
      await NotificationModel.create(
        [
          {
            type: 'LOW_STOCK',
            severity: 'WARNING',
            title: `Low Stock Alert: ${country.toUpperCase()} (${freeKg} kg remaining)`,
            message: `Available unreserved stock for material ${materialId} (${country.toUpperCase()}) is ${freeKg} kg (${freeDrums} drums), below threshold of ${threshold.minApprovedFreeKg} kg.`,
            targetRoles: ['Admin', 'Management', 'Warehouse', 'Production'],
            entityType: 'STOCK_THRESHOLD',
            entityId: threshold._id,
          },
        ],
        { session }
      );
    }
  }

  /**
   * 1. Receive an IncomingLot + auto-generate Drums (1 drum = 290 kg default) + append RECEIVE_QUARANTINE ledger rows [R3, R4]
   */
  static async receiveIncomingLot(input: ReceiveLotInput, actor: AuditActor) {
     if (
       input.unitPriceEurPerKg !== undefined &&
       !canRoleViewPrices(actor.roleName)
     ) {
       throw AppError.forbidden('Only Admin and Management may assign incoming stock prices.');
     }

     return withTransaction(async (session) => {
      const [supplier, material] = await Promise.all([
        SupplierModel.findById(input.supplierId).session(session),
        MaterialModel.findById(input.materialId).session(session),
      ]);
      if (!supplier || !supplier.isActive) {
        throw AppError.badRequest('Active supplier not found');
      }
      if (!material || !material.isActive) {
        throw AppError.badRequest('Active material not found');
      }
      if (material.unit !== input.unit) {
        throw AppError.badRequest(
          'RECEIPT_UNIT_MISMATCH',
          `Receipt unit ${input.unit} does not match ${material.name}'s configured unit (${material.unit}).`
        );
      }
      if (input.packageType === 'DRUM' && material.unit !== 'kg') {
        throw AppError.badRequest(
          'DRUM_RECEIPT_REQUIRES_KG',
          'Drum inventory is only supported for kg materials.'
        );
      }

      const contract = input.contractId
        ? await ContractModel.findById(input.contractId).session(session)
        : null;
      if (input.contractId && !contract) {
        throw AppError.notFound('Linked contract not found');
      }
      if (contract) {
        if (contract.isVoid || contract.status !== 'SHIPPED') {
          throw AppError.badRequest(
            'CONTRACT_NOT_SHIPPED',
            `Incoming goods can only be received against a shipped contract (current status: ${contract.status}).`
          );
        }
        if (
          !contract.supplierId.equals(supplier._id) ||
          !contract.materialId.equals(material._id) ||
          contract.country !== input.country.trim().toUpperCase()
        ) {
          throw AppError.badRequest(
            'CONTRACT_RECEIPT_MISMATCH',
            'Supplier, material, and origin country must match the shipped contract.'
          );
        }
        if (
          contract.packageType &&
          contract.packageType !== input.packageType
        ) {
          throw AppError.badRequest(
            'CONTRACT_PACKAGE_TYPE_MISMATCH',
            `Receipt package type must match the contract (${contract.packageType}).`
          );
        }
        if (
          input.sourcingId &&
          !contract.sourcingId.equals(input.sourcingId)
        ) {
          throw AppError.badRequest(
            'CONTRACT_SOURCING_MISMATCH',
            'The selected sourcing record does not belong to this contract.'
          );
        }
        if (
          contract.unitPriceEurPerKg !== undefined &&
          input.unitPriceEurPerKg !== undefined &&
          roundEur(contract.unitPriceEurPerKg) !==
            roundEur(input.unitPriceEurPerKg)
        ) {
          throw AppError.badRequest(
            'CONTRACT_PRICE_MISMATCH',
            'A linked contract controls the incoming-lot source price.'
          );
        }
      }

      const sourcingId =
        input.sourcingId ?? contract?.sourcingId?.toHexString() ?? undefined;
      if (sourcingId) {
        const sourcing = await SourcingModel.findById(sourcingId).session(session);
        if (!sourcing) throw AppError.notFound('Linked sourcing record not found');
        if (!['PASSED', 'CONTRACTED', 'SHIPPED'].includes(sourcing.status)) {
          throw AppError.badRequest(
            `Cannot receive incoming lot from sourcing ${sourcing.sourcingNo} in status ${sourcing.status}`
          );
        }
      }

      const year2d = new Date().getFullYear().toString().slice(-2);
      const lotNo = input.lotNo
        ? input.lotNo.trim().toUpperCase()
        : await getNextSequence(`INCOMING_LOT_${year2d}`, `IL-${year2d}-`, 4, session);

      const existingLot = await IncomingLotModel.findOne({ lotNo }).session(session);
      if (existingLot) {
        throw AppError.conflict(`IncomingLot ${lotNo} already exists`);
      }

      const received = resolveReceivedLotQuantities({
        unit: material.unit,
        packageCount: input.packageCount,
        massInputUnit: input.massInputUnit,
        totalInputWeight: input.totalInputWeight,
        quantityPerPackage:
          input.quantityPerPackage ?? input.netKgPerPackage,
        unitPriceEurPerKg: contract?.unitPriceEurPerKg ?? input.unitPriceEurPerKg,
      });
      const hasUnitPrice =
        contract?.unitPriceEurPerKg !== undefined ||
        input.unitPriceEurPerKg !== undefined;
      const quantityPerPackage =
        material.unit === 'kg' ? received.unitWeightKg : input.quantityPerPackage;
      if (quantityPerPackage === undefined) {
        throw AppError.badRequest('PACKAGE_QUANTITY_REQUIRED');
      }
      const netKgPerPackage =
        material.unit === 'kg' ? received.unitWeightKg : 0;
      const tareKgPerPackage =
        material.unit === 'kg' ? roundKg(input.tareKgPerPackage ?? 0) : 0;
      const country = input.country.trim().toUpperCase();
      const packageCount = input.packageCount;
      const totalQuantity = received.totalQty;
      const totalNetKg = received.totalNetKg;
      if (contract) {
        const reservation = await ContractModel.updateOne(
          {
            _id: contract._id,
            status: 'SHIPPED',
            isVoid: false,
            $expr: {
              $and: [
                {
                  $lte: [
                    {
                      $add: [
                        { $ifNull: ['$receivedKg', 0] },
                        totalNetKg,
                      ],
                    },
                    '$contractedKg',
                  ],
                },
                {
                  $lte: [
                    {
                      $add: [
                        { $ifNull: ['$receivedPackages', 0] },
                        packageCount,
                      ],
                    },
                    '$contractedDrums',
                  ],
                },
              ],
            },
          },
          {
            $inc: {
              receivedKg: totalNetKg,
              receivedPackages: packageCount,
            },
          },
          { session }
        );
        if (reservation.matchedCount !== 1) {
          throw AppError.conflict(
            'CONTRACT_BALANCE_EXCEEDED',
            'This receipt would exceed the shipped contract weight or package count.'
          );
        }
      }
      const totalGrossKg =
        material.unit === 'kg'
          ? roundKg(totalNetKg + packageCount * tareKgPerPackage)
          : 0;
      const packageType = input.packageType;

      const [incomingLot] = await IncomingLotModel.create(
        [
          {
            lotNo,
            sourcingId: sourcingId || null,
            contractId: input.contractId || null,
            supplierId: supplier._id,
            sourceNameSnapshot: supplier.name,
            materialId: material._id,
            materialCodeSnapshot: material.code,
            qualityGradeId: input.qualityGradeId || null,
            country,
            receivedDate: input.receivedDate || new Date(),
            packageType,
            packageCount,
            massInputUnit: input.massInputUnit,
            unitWeightKg: received.unitWeightKg,
            unit: material.unit,
            netKgPerPackage: material.unit === 'kg' ? netKgPerPackage : undefined,
            quantityPerPackage,
            quantityUnit: material.unit,
            totalQuantity,
            unitPriceEurPerKg: hasUnitPrice
              ? received.unitPriceEurPerKg
              : undefined,
            totalCostValueEur: received.totalCostValueEur,
            totalValueEur: hasUnitPrice
              ? received.totalCostValueEur
              : undefined,
            currency: 'EUR',
            drumsCount: packageType === 'DRUM' ? packageCount : 0,
            totalGrossKg,
            totalNetKg,
            status: 'UNDER_REVIEW',
            returnedToSupplier: false,
            notes: input.notes,
            labelData: {
              ...input.labelData,
              barcode:
                input.supplierLotBarcode ??
                input.labelData?.barcode,
            },
            labelMetadata: input.labelMetadata ?? null,
            createdBy: new mongoose.Types.ObjectId(actor.userId),
          },
        ],
        { session }
      );

      const packageOrigin = () => ({
        country,
        incomingLotId: incomingLot._id,
        sourceDrumId: null,
        sourcePackageId: null,
        sourceReworkId: null,
        kg: netKgPerPackage,
        pct: 100,
        unitPriceEurPerKg: received.unitPriceEurPerKg,
        valueEur: roundEur(netKgPerPackage * received.unitPriceEurPerKg),
        costValueEur: roundEur(netKgPerPackage * received.unitPriceEurPerKg),
        costSharePct: 100,
      });

      let createdDrums: Array<{ _id: mongoose.Types.ObjectId; netKg: number }> = [];
      let createdPackages: Array<{
        _id: mongoose.Types.ObjectId;
        netKg: number;
        quantity: number;
      }> = [];

      if (packageType === 'DRUM') {
        const drumDocsToInsert = Array.from({ length: packageCount }, (_, index) => {
          const drumNo = index + 1;
          const packageNetKg = received.perPackageQtys[index];
          return {
            drumCode: `${lotNo}-D${String(drumNo).padStart(3, '0')}`,
            incomingLotId: incomingLot._id,
            lotNoSnapshot: lotNo,
            drumNo,
            materialId: material._id,
            country,
            grossKg: roundKg(packageNetKg + tareKgPerPackage),
            tareKg: tareKgPerPackage,
            netKg: packageNetKg,
            status: 'Quarantine' as const,
            location: 'QuarantineZone',
            unitPriceEurPerKg: hasUnitPrice
              ? received.unitPriceEurPerKg
              : undefined,
            originComposition: [
              {
                ...packageOrigin(),
                kg: packageNetKg,
                costValueEur: roundEur(packageNetKg * received.unitPriceEurPerKg),
                valueEur: roundEur(packageNetKg * received.unitPriceEurPerKg),
              },
            ],
          };
        });
        createdDrums = await DrumModel.insertMany(drumDocsToInsert, { session });
      } else {
        const packageDocsToInsert = Array.from({ length: packageCount }, (_, index) => {
          const packageNo = index + 1;
          const packageQuantity = received.perPackageQtys[index];
          const packageNetKg = material.unit === 'kg' ? packageQuantity : 0;
          const packageCode = `${lotNo}-${packageType}-${String(packageNo).padStart(4, '0')}`;
          return {
            packageCode,
            packageType,
            incomingLotId: incomingLot._id,
            packageNo,
            materialId: material._id,
            country,
            unit: material.unit,
            quantity: packageQuantity,
            netKg: packageNetKg,
            tareKg: tareKgPerPackage,
            status: 'Quarantine' as const,
            location: 'QuarantineZone',
            unitPriceEurPerKg: hasUnitPrice
              ? received.unitPriceEurPerKg
              : undefined,
            originComposition:
              material.unit === 'kg'
                ? [
                    {
                      ...packageOrigin(),
                      kg: packageNetKg,
                      valueEur: roundEur(packageNetKg * received.unitPriceEurPerKg),
                      costValueEur: roundEur(packageNetKg * received.unitPriceEurPerKg),
                    },
                  ]
                : [],
          };
        });
        createdPackages = await StockPackageModel.insertMany(packageDocsToInsert, { session });
      }

      const ledgerEntries = [
        ...createdDrums.map((drum) => ({
          movementType: 'RECEIVE_QUARANTINE' as const,
          drumId: drum._id,
          incomingLotId: incomingLot._id,
          materialId: material._id,
          country,
          fromStatus: null,
          toStatus: 'Quarantine',
          fromLocation: 'Supplier',
          toLocation: 'QuarantineZone',
          signedKg: roundKg(drum.netKg),
          signedQuantity: roundKg(drum.netKg),
          quantityUnit: 'kg' as const,
          reason: input.reason,
          performedBy: new mongoose.Types.ObjectId(actor.userId),
        })),
        ...createdPackages.map((stockPackage) => ({
          movementType: 'RECEIVE_QUARANTINE' as const,
          stockPackageId: stockPackage._id,
          incomingLotId: incomingLot._id,
          materialId: material._id,
          country,
          fromStatus: null,
          toStatus: 'Quarantine',
          fromLocation: 'Supplier',
          toLocation: 'QuarantineZone',
          signedKg: roundKg(stockPackage.netKg),
          signedQuantity: stockPackage.quantity,
          quantityUnit: material.unit,
          reason: input.reason,
          performedBy: new mongoose.Types.ObjectId(actor.userId),
        })),
      ];

      await StockMovementModel.insertMany(ledgerEntries, { session });

      await recordAudit({
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'stock',
        action: 'CREATE',
        entityType: 'INCOMING_LOT',
        entityId: incomingLot._id,
        entityRef: lotNo,
        before: null,
        after: {
          lotNo,
          country,
          packageType,
          packageCount,
          unit: material.unit,
          quantityPerPackage,
          totalQuantity,
          unitPriceEurPerKg: hasUnitPrice
            ? received.unitPriceEurPerKg
            : undefined,
          totalNetKg,
          status: 'UNDER_REVIEW',
          labelData: input.labelData,
        },
        reason: input.reason,
        session,
      });

      return {
        lot: incomingLot.toObject(),
        drumsCreated: createdDrums.length,
        packagesCreated: createdPackages.length,
        packageCount,
        packageType,
        totalNetKg,
        unit: material.unit,
        totalQuantity,
      };
    });
  }

  /**
   * 2. QA Review IncomingLot: PASSED -> drums Approved; FAILED -> drums Rejected (1 transaction + ledger rows) [R3, R4]
   */
  static async reviewIncomingLot(input: ReviewLotInput, actor: AuditActor) {
    return withTransaction(async (session) => {
      const lot = await IncomingLotModel.findById(input.incomingLotId).session(session);
      if (!lot) throw AppError.notFound('Incoming lot not found');

      if (lot.status !== 'UNDER_REVIEW') {
        throw AppError.badRequest(
          `Incoming lot ${lot.lotNo} is already in status ${lot.status} and cannot be reviewed again.`
        );
      }

      if (input.qualityGradeId) {
        const grade = await QualityGradeModel.findById(input.qualityGradeId).session(session);
        if (!grade) throw AppError.badRequest('Invalid qualityGradeId');
        lot.qualityGradeId = grade._id as any;
      }

      const beforeLot = lot.toObject();
      const passed = input.decision === 'PASSED';

      const [labReport] = await LabReportModel.create(
        [
          {
            incomingLotId: lot._id,
            labName: input.labReport.labName || 'QSI Bremen',
            reportNo: input.labReport.reportNo,
            passed,
            moisturePct: input.labReport.moisturePct,
            hmfMgPerKg: input.labReport.hmfMgPerKg,
            diastaseDn: input.labReport.diastaseDn,
            c4SugarPassed: input.labReport.c4SugarPassed ?? true,
            nmrPassed: input.labReport.nmrPassed ?? true,
            attachmentId: input.labReport.attachmentId || null,
            notes: input.labReport.notes,
            reviewedBy: new mongoose.Types.ObjectId(actor.userId),
          },
        ],
        { session }
      );

      lot.status = input.decision;
      lot.reviewedBy = new mongoose.Types.ObjectId(actor.userId) as any;
      lot.reviewedAt = new Date();
      await lot.save({ session });

      const [drums, stockPackages] = await Promise.all([
        DrumModel.find({ incomingLotId: lot._id, status: 'Quarantine' }).session(session),
        StockPackageModel.find({ incomingLotId: lot._id, status: 'Quarantine' }).session(session),
      ]);

      const newDrumStatus = passed ? 'Approved' : 'Rejected';
      const newLocation = passed ? 'Warehouse' : 'RejectedZone';

      await DrumModel.updateMany(
        { incomingLotId: lot._id, status: 'Quarantine' },
        { $set: { status: newDrumStatus, location: newLocation } },
        { session }
      );
      await StockPackageModel.updateMany(
        { incomingLotId: lot._id, status: 'Quarantine' },
        { $set: { status: newDrumStatus, location: newLocation } },
        { session }
      );

      const movements = [
        ...drums.map((drum) => ({
        movementType: passed ? 'QA_APPROVE' : 'QA_REJECT',
        drumId: drum._id,
        incomingLotId: lot._id,
        materialId: lot.materialId,
        country: lot.country,
        fromStatus: 'Quarantine',
        toStatus: newDrumStatus,
        fromLocation: 'QuarantineZone',
        toLocation: newLocation,
        // Status change from Quarantine -> Approved keeps physical stock (+0 delta);
        // Quarantine -> Rejected removes stock from usable balance (-netKg delta).
        signedKg: passed ? 0 : -roundKg(drum.netKg),
        signedQuantity: passed ? 0 : -roundKg(drum.netKg),
        quantityUnit: 'kg' as const,
        reason: input.reason,
        performedBy: new mongoose.Types.ObjectId(actor.userId),
        })),
        ...stockPackages.map((stockPackage) => ({
          movementType: passed ? 'QA_APPROVE' : 'QA_REJECT',
          stockPackageId: stockPackage._id,
          incomingLotId: lot._id,
          materialId: lot.materialId,
          country: lot.country,
          fromStatus: 'Quarantine',
          toStatus: newDrumStatus,
          fromLocation: 'QuarantineZone',
          toLocation: newLocation,
          signedKg: passed ? 0 : -roundKg(stockPackage.netKg),
          signedQuantity: passed ? 0 : -stockPackage.quantity,
          quantityUnit: stockPackage.unit,
          reason: input.reason,
          performedBy: new mongoose.Types.ObjectId(actor.userId),
        })),
      ];

      if (movements.length > 0) {
        await StockMovementModel.insertMany(movements, { session });
      }

      if (!passed) {
        await NotificationModel.create(
          [
            {
              type: 'DEVIATION_MISMATCH',
              severity: 'CRITICAL',
              title: `Incoming Lot FAILED QA: ${lot.lotNo}`,
              message: `Lot ${lot.lotNo} (${lot.country}, ${lot.totalQuantity ?? lot.totalNetKg} ${lot.unit ?? 'kg'}) failed QA review (${input.labReport.reportNo}). Reason: ${input.reason}`,
              targetRoles: ['Admin', 'Management', 'QA', 'Warehouse'],
              entityType: 'INCOMING_LOT',
              entityId: lot._id,
            },
          ],
          { session }
        );
      } else if (lot.unit === 'kg' || !lot.unit) {
        await this.evaluateLowStockThreshold(lot.materialId, lot.country, session);
      }

      await recordAudit({
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'stock',
        action: input.decision === 'PASSED' ? 'APPROVE' : 'REJECT',
        entityType: 'INCOMING_LOT',
        entityId: lot._id,
        entityRef: lot.lotNo,
        before: beforeLot,
        after: {
          lotStatus: lot.status,
          labReportId: labReport._id,
          packagesUpdated: drums.length + stockPackages.length,
          newDrumStatus,
        },
        reason: input.reason,
        session,
      });

      return {
        lot: lot.toObject(),
        labReport: labReport.toObject(),
        packagesUpdated: drums.length + stockPackages.length,
      };
    });
  }

  /**
   * 3. Return to Supplier on Mismatch (Blocks Sourcing, Rejects Lot & Drums, Reverses Ledger) [R1, R3, R10]
   */
  static async returnLotOnMismatch(input: ReturnMismatchInput, actor: AuditActor) {
    return withTransaction(async (session) => {
      const lot = await IncomingLotModel.findById(input.incomingLotId).session(session);
      if (!lot) throw AppError.notFound('Incoming lot not found');

      const [consumedDrums, consumedPackages] = await Promise.all([
        DrumModel.countDocuments({
          incomingLotId: lot._id,
          status: { $in: ['InBatch', 'Consumed'] },
        }).session(session),
        StockPackageModel.countDocuments({
          incomingLotId: lot._id,
          status: { $in: ['InBatch', 'Consumed'] },
        }).session(session),
      ]);
      const consumedCount = consumedDrums + consumedPackages;

      if (consumedCount > 0) {
        throw AppError.badRequest(
          `Cannot return lot ${lot.lotNo} to supplier because ${consumedCount} stock unit(s) are already in a batch or consumed.`
        );
      }

      const beforeLot = lot.toObject();
      lot.status = 'FAILED';
      lot.returnedToSupplier = true;
      lot.mismatchReason = input.mismatchDetails;
      lot.returnedAt = new Date();
      await lot.save({ session });

      if (lot.sourcingId) {
        await SourcingModel.findByIdAndUpdate(
          lot.sourcingId,
          {
            $set: {
              status: 'BLOCKED',
              mismatchBlockedReason: input.mismatchDetails,
            },
          },
          { session }
        );
      }

      const [activeDrums, activePackages] = await Promise.all([
        DrumModel.find({
          incomingLotId: lot._id,
          status: { $nin: ['Rejected', 'Void'] },
        }).session(session),
        StockPackageModel.find({
          incomingLotId: lot._id,
          status: { $nin: ['Rejected', 'Void'] },
        }).session(session),
      ]);

      await DrumModel.updateMany(
        { _id: { $in: activeDrums.map((d) => d._id) } },
        { $set: { status: 'Rejected', location: 'ReturnedToSupplier' } },
        { session }
      );
      await StockPackageModel.updateMany(
        { _id: { $in: activePackages.map((p) => p._id) } },
        { $set: { status: 'Rejected', location: 'ReturnedToSupplier' } },
        { session }
      );

      const reversalMovements = [
        ...activeDrums.map((drum) => ({
        movementType: 'QA_REJECT',
        drumId: drum._id,
        incomingLotId: lot._id,
        materialId: lot.materialId,
        country: lot.country,
        fromStatus: drum.status,
        toStatus: 'Rejected',
        fromLocation: drum.location,
        toLocation: 'ReturnedToSupplier',
        signedKg: -roundKg(drum.netKg),
        signedQuantity: -roundKg(drum.netKg),
        quantityUnit: 'kg' as const,
        reason: `MISMATCH RETURN: ${input.reason}`,
        performedBy: new mongoose.Types.ObjectId(actor.userId),
        })),
        ...activePackages.map((stockPackage) => ({
          movementType: 'QA_REJECT',
          stockPackageId: stockPackage._id,
          incomingLotId: lot._id,
          materialId: lot.materialId,
          country: lot.country,
          fromStatus: stockPackage.status,
          toStatus: 'Rejected',
          fromLocation: stockPackage.location,
          toLocation: 'ReturnedToSupplier',
          signedKg: -roundKg(stockPackage.netKg),
          signedQuantity: -stockPackage.quantity,
          quantityUnit: stockPackage.unit,
          reason: `MISMATCH RETURN: ${input.reason}`,
          performedBy: new mongoose.Types.ObjectId(actor.userId),
        })),
      ];

      if (reversalMovements.length > 0) {
        await StockMovementModel.insertMany(reversalMovements, { session });
      }

      await NotificationModel.create(
        [
          {
            type: 'DEVIATION_MISMATCH',
            severity: 'CRITICAL',
            title: `MISMATCH BLOCKED & RETURNED: Lot ${lot.lotNo}`,
            message: `Lot ${lot.lotNo} (${lot.country}) blocked and marked for supplier return. Details: ${input.mismatchDetails}`,
            targetRoles: ['Admin', 'Management', 'QA', 'Warehouse'],
            entityType: 'INCOMING_LOT',
            entityId: lot._id,
          },
        ],
        { session }
      );

      if (lot.unit === 'kg' || !lot.unit) {
        await this.evaluateLowStockThreshold(lot.materialId, lot.country, session);
      }

      await recordAudit({
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'stock',
        action: 'REJECT',
        entityType: 'INCOMING_LOT',
        entityId: lot._id,
        entityRef: lot.lotNo,
        before: beforeLot,
        after: lot.toObject(),
        reason: input.reason,
        session,
      });

      return {
        lot: lot.toObject(),
        drumsReturned: activeDrums.length,
        packagesReturned: activePackages.length,
      };
    });
  }

  /**
   * 4. Listing of IncomingLots with Drum Usage Breakdown [R3]
   */
  static async listIncomingLotsWithUsage(filters: {
    status?: string;
    country?: string;
    materialId?: string;
  }): Promise<IncomingLotWithUsage[]> {
    const match: Record<string, unknown> = {};
    if (filters.status) match.status = filters.status;
    if (filters.country) match.country = filters.country.toUpperCase();
    if (filters.materialId) {
      match.materialId = new mongoose.Types.ObjectId(filters.materialId);
    }

    const lots = await IncomingLotModel.find(match)
      .populate('supplierId', 'code name country')
      .populate('materialId', 'code name kind')
      .populate('qualityGradeId', 'code name')
      .sort({ receivedDate: -1, createdAt: -1 })
      .lean();

    if (lots.length === 0) return [];

    const lotIds = lots.map((l) => l._id);
    const [drumStats, packageStats] = await Promise.all([
      DrumModel.aggregate([
        { $match: { incomingLotId: { $in: lotIds } } },
        {
          $group: {
            _id: { incomingLotId: '$incomingLotId', status: '$status' },
            packages: { $sum: 1 },
            kg: { $sum: '$netKg' },
            quantity: { $sum: '$netKg' },
            unit: { $first: 'kg' },
          },
        },
      ]),
      StockPackageModel.aggregate([
        { $match: { incomingLotId: { $in: lotIds } } },
        {
          $group: {
            _id: {
              incomingLotId: '$incomingLotId',
              status: '$status',
              unit: { $ifNull: ['$unit', 'kg'] },
            },
            packages: { $sum: 1 },
            kg: { $sum: '$netKg' },
            quantity: { $sum: { $ifNull: ['$quantity', '$netKg'] } },
          },
        },
      ]),
    ]);

    const usageMap = new Map<
      string,
      {
        quarantineDrums: number;
        availableDrums: number;
        packageCount: number;
        availableKg: number;
        availableQuantity: number;
        quantityUnit: string;
        inWarmOrReservedDrums: number;
        consumedDrums: number;
        consumedKg: number;
        consumedQuantity: number;
        rejectedDrums: number;
      }
    >();

    for (const row of [...drumStats, ...packageStats]) {
      const key = String(row._id.incomingLotId);
      const curr = usageMap.get(key) || {
        quarantineDrums: 0,
        availableDrums: 0,
        packageCount: 0,
        availableKg: 0,
        availableQuantity: 0,
        quantityUnit: row._id.unit ?? 'kg',
        inWarmOrReservedDrums: 0,
        consumedDrums: 0,
        consumedKg: 0,
        consumedQuantity: 0,
        rejectedDrums: 0,
      };
      const st = row._id.status;
      curr.quantityUnit = row._id.unit ?? curr.quantityUnit;
      curr.packageCount += row.packages;
      if (st === 'Quarantine') curr.quarantineDrums += row.packages;
      else if (st === 'Approved' || st === 'InWarehouse') {
        curr.availableDrums += row.packages;
        curr.availableKg = roundKg(curr.availableKg + row.kg);
        curr.availableQuantity += row.quantity;
      } else if (st === 'InWarmRoom' || st === 'Reserved' || st === 'InBatch') {
        curr.inWarmOrReservedDrums += row.packages;
      } else if (st === 'Consumed') {
        curr.consumedDrums += row.packages;
        curr.consumedKg = roundKg(curr.consumedKg + row.kg);
        curr.consumedQuantity += row.quantity;
      } else if (st === 'Rejected' || st === 'Void') {
        curr.rejectedDrums += row.packages;
      }
      usageMap.set(key, curr);
    }

    return lots.map((lot) => ({
      ...lot,
      usage: usageMap.get(String(lot._id)) || {
        quarantineDrums: 0,
        availableDrums: 0,
        packageCount: 0,
        availableKg: 0,
        availableQuantity: 0,
        quantityUnit: String(lot.unit ?? 'kg'),
        inWarmOrReservedDrums: 0,
        consumedDrums: 0,
        consumedKg: 0,
        consumedQuantity: 0,
        rejectedDrums: 0,
      },
    }));
  }

  /**
   * 5. Live Stock Summary by Material & Origin Country [R4]
   */
  static async getStockSummary() {
    const aggregateByStockUnit = (includePackageType: boolean) => [
      { $match: { status: { $nin: ['Void'] } } },
      {
        $group: {
          _id: {
            materialId: '$materialId',
            country: '$country',
            status: '$status',
            ...(includePackageType ? { packageType: '$packageType' } : {}),
            unit: includePackageType ? { $ifNull: ['$unit', 'kg'] } : 'kg',
          },
          packageCount: { $sum: 1 },
          totalNetKg: { $sum: '$netKg' },
          totalQuantity: {
            $sum: includePackageType
              ? { $ifNull: ['$quantity', '$netKg'] }
              : '$netKg',
          },
        },
      },
      {
        $lookup: {
          from: 'materials',
          localField: '_id.materialId',
          foreignField: '_id',
          as: 'material',
        },
      },
      { $unwind: { path: '$material', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          materialId: '$_id.materialId',
          materialCode: '$material.code',
          materialName: '$material.name',
          materialKind: '$material.kind',
          country: '$_id.country',
          status: '$_id.status',
          packageType: includePackageType ? '$_id.packageType' : 'DRUM',
          unit: '$_id.unit',
          drumsCount: includePackageType ? 0 : '$packageCount',
          packageCount: 1,
          totalNetKg: { $round: ['$totalNetKg', 3] },
          totalQuantity: { $round: ['$totalQuantity', 3] },
        },
      },
    ];
    const [drums, packages] = await Promise.all([
      DrumModel.aggregate(aggregateByStockUnit(false)),
      StockPackageModel.aggregate(aggregateByStockUnit(true)),
    ]);
    return [...drums, ...packages].sort(
      (a, b) =>
        String(a.materialCode).localeCompare(String(b.materialCode)) ||
        String(a.country).localeCompare(String(b.country)) ||
        String(a.status).localeCompare(String(b.status))
    );
  }

  /**
   * 6. Append-Only Stock Ledger Integrity Verification (`[R4, R14]`)
   */
  static async verifyLedgerIntegrity() {
    return withSnapshotRead(async (session) => {
      const [drums, stockPackages, ledgerSums] = await Promise.all([
        DrumModel.find({}, 'drumCode status netKg incomingLotId')
          .session(session)
          .lean(),
        StockPackageModel.find({}, 'packageCode status netKg incomingLotId unit quantity')
          .session(session)
          .lean(),
        StockMovementModel.aggregate([
          {
            $group: {
              _id: { $ifNull: ['$drumId', '$stockPackageId'] },
              ledgerBalanceKg: { $sum: '$signedKg' },
              ledgerBalanceQuantity: {
                $sum: { $ifNull: ['$signedQuantity', '$signedKg'] },
              },
              movementsCount: { $sum: 1 },
            },
          },
        ]).session(session),
      ]);

      const ledgerMap = new Map<
        string,
        { ledgerBalanceKg: number; ledgerBalanceQuantity: number; movementsCount: number }
      >();
      for (const item of ledgerSums) {
        if (item._id) {
          ledgerMap.set(String(item._id), {
            ledgerBalanceKg: roundKg(item.ledgerBalanceKg),
            ledgerBalanceQuantity: Number(item.ledgerBalanceQuantity),
            movementsCount: item.movementsCount,
          });
        }
      }

      const discrepancies: Array<{
        stockUnitId: string;
        stockUnitCode: string;
        stockUnitType: 'DRUM' | 'PACKAGE';
        drumId?: string;
        drumCode?: string;
        status: string;
        quantityUnit: string;
        expectedKg: number;
        ledgerBalanceKg: number;
        expectedQuantity: number;
        ledgerBalanceQuantity: number;
      }> = [];
      const stockUnits = [
        ...drums.map((drum) => ({
          id: drum._id,
          code: drum.drumCode || String(drum._id),
          type: 'DRUM' as const,
          status: drum.status,
          netKg: drum.netKg,
          unit: 'kg' as const,
          quantity: drum.netKg,
        })),
        ...stockPackages.map((stockPackage) => ({
          id: stockPackage._id,
          code: stockPackage.packageCode,
          type: 'PACKAGE' as const,
          status: stockPackage.status,
          netKg: stockPackage.netKg,
          unit: stockPackage.unit ?? 'kg',
          quantity: stockPackage.quantity ?? stockPackage.netKg,
        })),
      ];

      const activeStatuses = new Set([
        'Quarantine',
        'Approved',
        'InWarehouse',
        'InWarmRoom',
        'Reserved',
        'InBatch',
      ]);

      for (const stockUnit of stockUnits) {
        const expectedKg = activeStatuses.has(stockUnit.status) ? roundKg(stockUnit.netKg) : 0;
        const entry = ledgerMap.get(String(stockUnit.id));
        const actualLedgerKg = entry ? entry.ledgerBalanceKg : 0;
        const expectedQuantity = activeStatuses.has(stockUnit.status)
          ? stockUnit.unit === 'kg'
            ? Number(stockUnit.netKg)
            : Number(stockUnit.quantity)
          : 0;
        const actualLedgerQuantity = entry ? entry.ledgerBalanceQuantity : 0;

        if (
          Math.abs(expectedKg - actualLedgerKg) > 0.001 ||
          Math.abs(expectedQuantity - actualLedgerQuantity) > 0.001
        ) {
          discrepancies.push({
            stockUnitId: String(stockUnit.id),
            stockUnitCode: stockUnit.code,
            stockUnitType: stockUnit.type,
            ...(stockUnit.type === 'DRUM'
              ? { drumId: String(stockUnit.id), drumCode: stockUnit.code }
              : {}),
            status: stockUnit.status,
            quantityUnit: stockUnit.unit,
            expectedKg,
            ledgerBalanceKg: actualLedgerKg,
            expectedQuantity,
            ledgerBalanceQuantity: actualLedgerQuantity,
          });
        }
      }

      return {
        healthy: discrepancies.length === 0,
        checkedDrumsCount: drums.length,
        checkedPackagesCount: stockPackages.length,
        checkedStockUnitsCount: stockUnits.length,
        discrepanciesCount: discrepancies.length,
        discrepancies,
        checkedAt: new Date().toISOString(),
      };
    });
  }
}