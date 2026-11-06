// server/src/modules/trace/trace.service.ts
import { ClientSession, Types } from 'mongoose';
import {
  BatchInputModel,
  BatchModel,
  CustomerModel,
  DrumModel,
  IncomingLotModel,
  LabReportModel,
  NotificationModel,
  ProcessStepModel,
  ReworkStockModel,
  ShipmentLotModel,
  StockMovementModel,
  StockPackageModel,
} from '../../models';
import { withSnapshotRead, withTransaction } from '../../config/db';
import { AppError } from '../../common/errors';
import { recordAudit } from '../../common/audit.helper';
import {
  canRoleViewPrices,
  sanitizeOriginSlicesForRole,
} from '../../common/price-strip.helper';
import { roundKg } from '../../../../shared/src/schemas/common';

const COMMERCIAL_FIELDS = [
  'unitPriceEurPerKg',
  'totalCostValueEur',
  'costValueEur',
  'costSharePct',
  'totalValueEur',
  'valueEur',
  'weightedAvgEurPerKg',
] as const;

function sanitizeRecord<T extends Record<string, unknown>>(
  value: T,
  showPrices: boolean
): T {
  if (showPrices) return value;
  const sanitized: Record<string, unknown> = { ...value };
  for (const field of COMMERCIAL_FIELDS) {
    delete sanitized[field];
  }
  if (
    'labelData' in sanitized &&
    sanitized['labelData'] &&
    typeof sanitized['labelData'] === 'object' &&
    !Array.isArray(sanitized['labelData'])
  ) {
    const labelData = {
      ...(sanitized['labelData'] as Record<string, unknown>),
    };
    delete labelData.unitPriceEurPerKg;
    sanitized['labelData'] = labelData;
  }
  return sanitized as T;
}

function sanitizeIncomingLot(
  lot: Record<string, unknown>,
  country: string,
  showPrices: boolean,
  isInspector: boolean
): Record<string, unknown> {
  const sanitized = sanitizeRecord(lot, showPrices);
  if (!isInspector) return sanitized;

  const labelData =
    sanitized.labelData &&
    typeof sanitized.labelData === 'object' &&
    !Array.isArray(sanitized.labelData)
      ? { ...(sanitized.labelData as Record<string, unknown>) }
      : undefined;
  if (labelData) {
    delete labelData.supplierName;
    delete labelData.exporter;
    delete labelData.rawText;
  }
  const labelMetadata =
    sanitized.labelMetadata &&
    typeof sanitized.labelMetadata === 'object' &&
    !Array.isArray(sanitized.labelMetadata)
      ? { ...(sanitized.labelMetadata as Record<string, unknown>) }
      : undefined;
  if (labelMetadata) {
    delete labelMetadata.extractedSupplier;
    delete labelMetadata.rawText;
  }

  return {
    ...sanitized,
    sourceNameSnapshot: `SUPPLIER-${country}`,
    ...(labelData ? { labelData } : {}),
    ...(labelMetadata ? { labelMetadata } : {}),
  };
}

export class TraceService {
  /**
   * Returns up to 6 real entity codes from the database for the "TRY ONE OF YOUR RECORDS" chips
   */
  static async listSuggestedTraceCodes(): Promise<string[]> {
    const batches = await BatchModel.find({ isVoid: false })
      .sort({ createdAt: -1 })
      .limit(2)
      .select('processNo')
      .lean();
    const drums = await DrumModel.find()
      .sort({ createdAt: -1 })
      .limit(2)
      .select('drumCode')
      .lean();
    const lots = await IncomingLotModel.find()
      .sort({ createdAt: -1 })
      .limit(1)
      .select('lotNo')
      .lean();
    const shipments = await ShipmentLotModel.find({ isVoid: false })
      .sort({ createdAt: -1 })
      .limit(1)
      .select('shipmentLotNo')
      .lean();

    const codes: string[] = [
      ...batches.map((b) => b.processNo),
      ...drums.map((d) => d.drumCode),
      ...lots.map((l) => l.lotNo),
      ...shipments.map((s) => s.shipmentLotNo),
    ].filter(Boolean);

    return Array.from(new Set(codes));
  }

  /**
   * Snapshot-isolated bi-directional traceability lookup for Government Inspection [R11]
   * Surfaces HonigV QSI lab parameters on IncomingLots and masks commercial prices per R9.
   * Executes sequentially within the session to prevent MongoDB transaction counter tearing.
   */
  static async traceByReference(queryCode: string, actorRole: string) {
    const cleanCode = queryCode.trim().toUpperCase();
    if (!cleanCode) {
      throw AppError.badRequest(
        'INVALID_TRACE_CODE',
        'Provide a non-empty reference code.'
      );
    }

    const isInspector = actorRole === 'Inspector' || actorRole === 'INSPECTOR';
    const showPrices = canRoleViewPrices(actorRole);

    return withSnapshotRead(async (session: ClientSession) => {
      const directLot = await IncomingLotModel.findOne({ lotNo: cleanCode })
        .session(session)
        .lean();
      const directDrum = await DrumModel.findOne({
        $or: [{ drumCode: cleanCode }, { barcode: cleanCode }],
      })
        .session(session)
        .lean();
      const directBatch = await BatchModel.findOne({ processNo: cleanCode, isVoid: false })
        .session(session)
        .lean();
      const directRework = await ReworkStockModel.findOne({ reworkNo: cleanCode, isVoid: false })
        .session(session)
        .lean();
      const directShipment = await ShipmentLotModel.findOne({ shipmentLotNo: cleanCode, isVoid: false })
        .session(session)
        .lean();
      const directPackage = await StockPackageModel.findOne({ packageCode: cleanCode })
        .session(session)
        .lean();

      if (
        !directLot &&
        !directDrum &&
        !directBatch &&
        !directRework &&
        !directShipment &&
        !directPackage
      ) {
        throw AppError.notFound('Traceable entity', cleanCode);
      }

      const batchIds = new Set<string>();
      if (directBatch) batchIds.add(String(directBatch._id));
      if (directShipment) batchIds.add(String(directShipment.batchId));
      if (directRework) batchIds.add(String(directRework.sourceBatchId));
      if (directDrum?.reservedBatchId) {
        batchIds.add(String(directDrum.reservedBatchId));
      }
      if (directDrum?.sourceBatchId) {
        batchIds.add(String(directDrum.sourceBatchId));
      }
      if (directDrum?.sourceReworkId) {
        const drumRework = await ReworkStockModel.findOne({
          _id: directDrum.sourceReworkId,
          isVoid: false,
        })
          .session(session)
          .lean();
        if (drumRework) batchIds.add(String(drumRework.sourceBatchId));
      }
      if (directPackage?.reservedBatchId) {
        batchIds.add(String(directPackage.reservedBatchId));
      }

      const directIncomingLotId =
        directLot?._id ?? directDrum?.incomingLotId ?? directPackage?.incomingLotId;
      if (directIncomingLotId) {
        const inputs = await BatchInputModel.find({
          incomingLotId: directIncomingLotId,
          isVoid: false,
        })
          .session(session)
          .lean();
        inputs.forEach((input) => batchIds.add(String(input.batchId)));
      }

      // Traverse rework links up to 10 depths to discover parent batches
      const visitedBatchIds = new Set<string>();
      for (let depth = 0; depth < 10; depth += 1) {
        const newBatchIds = [...batchIds].filter((id) => !visitedBatchIds.has(id));
        if (newBatchIds.length === 0) break;
        newBatchIds.forEach((id) => visitedBatchIds.add(id));
        const inputs = await BatchInputModel.find({
          batchId: { $in: newBatchIds.map((id) => new Types.ObjectId(id)) },
          isVoid: false,
        })
          .session(session)
          .lean();
        const reworkIds = inputs
          .map((input) => input.reworkStockId)
          .filter((id): id is Types.ObjectId => Boolean(id));
        if (directRework) reworkIds.push(directRework._id);
        const sourceReworks = reworkIds.length
          ? await ReworkStockModel.find({
              _id: { $in: reworkIds },
              isVoid: false,
            })
              .session(session)
              .lean()
          : [];
        sourceReworks.forEach((rework) => batchIds.add(String(rework.sourceBatchId)));
      }

      const batchObjectIds = Array.from(batchIds).map((id) => new Types.ObjectId(id));

      const batches = await BatchModel.find({ _id: { $in: batchObjectIds }, isVoid: false })
        .session(session)
        .lean();
      const batchInputs = await BatchInputModel.find({ batchId: { $in: batchObjectIds }, isVoid: false })
        .session(session)
        .lean();
      const processSteps = await ProcessStepModel.find({ batchId: { $in: batchObjectIds }, isVoid: false })
        .sort({ stepSequence: 1 })
        .session(session)
        .lean();
      const reworkStocks = await ReworkStockModel.find({
        $or: [
          { sourceBatchId: { $in: batchObjectIds } },
          ...(directRework ? [{ _id: directRework._id }] : []),
        ],
        isVoid: false,
      })
        .session(session)
        .lean();
      const shipmentLots = await ShipmentLotModel.find({ batchId: { $in: batchObjectIds }, isVoid: false })
        .session(session)
        .lean();

      const incomingLotIds = new Set<string>();
      if (directLot) incomingLotIds.add(String(directLot._id));
      if (directDrum?.incomingLotId) incomingLotIds.add(String(directDrum.incomingLotId));
      if (directPackage?.incomingLotId) incomingLotIds.add(String(directPackage.incomingLotId));
      for (const inp of batchInputs) {
        if (inp.incomingLotId) incomingLotIds.add(String(inp.incomingLotId));
      }
      for (const b of batches) {
        for (const slice of b.originComposition || []) {
          incomingLotIds.add(String(slice.incomingLotId));
        }
      }
      for (const rw of reworkStocks) {
        for (const slice of rw.origin || []) {
          incomingLotIds.add(String(slice.incomingLotId));
        }
      }

      const lotObjectIds = Array.from(incomingLotIds).map((id) => new Types.ObjectId(id));
      const incomingLots = await IncomingLotModel.find({ _id: { $in: lotObjectIds } })
        .session(session)
        .lean();
      const labReports = await LabReportModel.find({ incomingLotId: { $in: lotObjectIds } })
        .sort({ createdAt: -1 })
        .session(session)
        .lean();

      const relatedStockQuery = {
        incomingLotId: { $in: lotObjectIds },
      };
      const drums = await DrumModel.find({
        $or: [
          relatedStockQuery,
          ...(directDrum ? [{ _id: directDrum._id }] : []),
          { sourceBatchId: { $in: batchObjectIds } },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(500)
        .session(session)
        .lean();
      const packages = await StockPackageModel.find({
        $or: [
          relatedStockQuery,
          ...(directPackage ? [{ _id: directPackage._id }] : []),
        ],
      })
        .sort({ createdAt: 1 })
        .limit(500)
        .session(session)
        .lean();
      const stockMovements = await StockMovementModel.find({
        $or: [
          { batchId: { $in: batchObjectIds } },
          { incomingLotId: { $in: lotObjectIds } },
          ...(directDrum ? [{ drumId: directDrum._id }] : []),
          ...(directPackage ? [{ stockPackageId: directPackage._id }] : []),
        ],
      })
        .sort({ createdAt: -1 })
        .limit(200)
        .session(session)
        .lean();

      const labByLotId = new Map<string, (typeof labReports)[number]>();
      for (const rep of labReports) {
        const key = rep.incomingLotId.toHexString();
        if (!labByLotId.has(key)) {
          labByLotId.set(key, rep);
        }
      }

      const customerIds = shipmentLots.map((s) => s.customerId);
      const customers = await CustomerModel.find({ _id: { $in: customerIds } })
        .session(session)
        .lean();

      const customerMap = new Map(
        customers.map((c) => [
          c._id.toHexString(),
          isInspector ? `BUYER-${c.country}` : c.name,
        ])
      );

      const sanitizedCustomers = customers.map((c) => ({
        _id: c._id,
        code: c.code,
        name: isInspector ? `INSPECTOR-REDACTED-${c.country}` : c.name,
        country: c.country,
        allowedCountries: c.allowedCountries,
      }));

      // Combined drums & packages list for unified Gebinde explorer
      const combinedDrums = [
        ...drums.map((d) => {
          const sanitized = sanitizeRecord(
            d as unknown as Record<string, unknown>,
            showPrices
          );
          return {
            ...sanitized,
            _id: d._id,
            drumCode: d.drumCode,
            country: d.country,
            netKg: d.netKg,
            status: d.status,
            location: d.location,
            incomingLotId: d.incomingLotId ? d.incomingLotId.toHexString() : '',
            originComposition: sanitizeOriginSlicesForRole(
              d.originComposition || [],
              actorRole
            ),
          };
        }),
        ...packages.map((p) => {
          const sanitized = sanitizeRecord(
            p as unknown as Record<string, unknown>,
            showPrices
          );
          return {
            ...sanitized,
            _id: p._id,
            drumCode: p.packageCode,
            country: p.country,
            netKg: p.netKg,
            status: p.status,
            location: p.location,
            incomingLotId: p.incomingLotId ? p.incomingLotId.toHexString() : '',
            originComposition: sanitizeOriginSlicesForRole(
              p.originComposition || [],
              actorRole
            ),
          };
        }),
      ];

      return {
        queriedCode: cleanCode,
        inspectorMode: isInspector,
        pricesVisible: showPrices,
        snapshotAt: new Date().toISOString(),
        upstream: {
          incomingLots: incomingLots.map((lot) => {
            const sanitizedLot = sanitizeIncomingLot(
              lot as unknown as Record<string, unknown>,
              lot.country,
              showPrices,
              isInspector
            );
            const lab = labByLotId.get(lot._id.toHexString());

            return {
              ...sanitizedLot,
              sourceNameSnapshot: sanitizedLot.sourceNameSnapshot as string,
              drumsCount: lot.drumsCount || lot.totalQuantity || 0,
              qsiSummary: lab
                ? {
                    labName: lab.labName,
                    reportNo: lab.reportNo,
                    moisturePct: lab.moisturePct ?? null,
                    hmfMgPerKg: lab.hmfMgPerKg ?? null,
                    diastaseDn: lab.diastaseDn ?? null,
                    c4SugarPassed: lab.c4SugarPassed,
                    nmrPassed: lab.nmrPassed,
                    attachmentId: lab.attachmentId ?? null,
                  }
                : null,
            };
          }),
          drumsCount: combinedDrums.length,
          drums: combinedDrums,
        },
        production: {
          batches: batches.map((b) => {
            const reworkInputKg = roundKg(
              (b.originComposition || [])
                .filter((s) => Boolean(s.sourceReworkId))
                .reduce((sum, s) => sum + Number(s.kg || 0), 0)
            );
            const totalKg = roundKg(Number(b.approvedKg || b.plannedKg || 0));
            const sanitizedBatch = sanitizeRecord(
              b as unknown as Record<string, unknown>,
              showPrices
            );
            return {
              ...sanitizedBatch,
              reworkInputKg,
              reworkInputPct:
                totalKg > 0 ? Number(((reworkInputKg / totalKg) * 100).toFixed(2)) : 0,
              originComposition: sanitizeOriginSlicesForRole(
                b.originComposition || [],
                actorRole
              ),
            };
          }),
          batchInputs: batchInputs.map((inp) => {
            const sanitizedInput = sanitizeRecord(
              inp as unknown as Record<string, unknown>,
              showPrices
            );
            return {
              ...sanitizedInput,
              originSnapshot: sanitizeOriginSlicesForRole(
                inp.originSnapshot || [],
                actorRole
              ),
            };
          }),
          processSteps,
          reworkStocks: reworkStocks.map((rw) => {
            const sanitizedRework = sanitizeRecord(
              rw as unknown as Record<string, unknown>,
              showPrices
            );
            return {
              ...sanitizedRework,
              origin: sanitizeOriginSlicesForRole(rw.origin || [], actorRole),
            };
          }),
        },
        downstream: {
          shipmentLots: shipmentLots.map((shp) => {
            const sanitizedShipment = sanitizeRecord(
              shp as unknown as Record<string, unknown>,
              showPrices
            );
            return {
              ...sanitizedShipment,
              customerDisplayName:
                customerMap.get(shp.customerId.toHexString()) ||
                `BUYER-${shp.destinationCountry}`,
              originComposition: sanitizeOriginSlicesForRole(
                shp.originComposition || [],
                actorRole
              ),
            };
          }),
          customers: sanitizedCustomers,
        },
        ledgerMovements: stockMovements,
      };
    });
  }

  // Alias for backward compatibility
  static async traceEntity(queryCode: string, actorRole: string) {
    return this.traceByReference(queryCode, actorRole);
  }

  /**
   * IFS Food v8 Clause 4.18.2 Instant Regulatory Hold ("Charge sofort sperren")
   * Atomically locks unconsumed drums in Quarantine and places unshipped ShipmentLots on QA_HOLD.
   */
  static async placeRegulatoryHold(
    queryCode: string,
    userId: string,
    actorRole: string,
    reason: string
  ) {
    const cleanCode = queryCode.trim().toUpperCase();
    if (!cleanCode) {
      throw AppError.badRequest('INVALID_TRACE_CODE', 'Provide a reference code to hold.');
    }

    return withTransaction(async (session: ClientSession) => {
      const actorObjectId = new Types.ObjectId(userId);

      const directLot = await IncomingLotModel.findOne({ lotNo: cleanCode }).session(session);
      const directDrum = await DrumModel.findOne({
        $or: [{ drumCode: cleanCode }, { barcode: cleanCode }],
      }).session(session);
      const directBatch = await BatchModel.findOne({ processNo: cleanCode, isVoid: false }).session(session);
      const directShipment = await ShipmentLotModel.findOne({
        shipmentLotNo: cleanCode,
        isVoid: false,
      }).session(session);
      const directPackage = await StockPackageModel.findOne({ packageCode: cleanCode }).session(session);

      if (!directLot && !directDrum && !directBatch && !directShipment && !directPackage) {
        throw AppError.notFound('Traceable entity for Regulatory Hold', cleanCode);
      }

      const targetBatchIds = new Set<string>();
      const targetLotIds = new Set<string>();

      if (directLot) targetLotIds.add(directLot._id.toHexString());
      if (directDrum) {
        if (directDrum.incomingLotId) targetLotIds.add(directDrum.incomingLotId.toHexString());
        if (directDrum.reservedBatchId) {
          targetBatchIds.add(directDrum.reservedBatchId.toHexString());
        }
      }
      if (directPackage) {
        if (directPackage.incomingLotId) targetLotIds.add(directPackage.incomingLotId.toHexString());
        if (directPackage.reservedBatchId) {
          targetBatchIds.add(directPackage.reservedBatchId.toHexString());
        }
      }
      if (directBatch) {
        targetBatchIds.add(directBatch._id.toHexString());
        for (const s of directBatch.originComposition || []) {
          targetLotIds.add(s.incomingLotId.toHexString());
        }
      }
      if (directShipment) {
        targetBatchIds.add(directShipment.batchId.toHexString());
      }

      const lotObjectIds = Array.from(targetLotIds).map((id) => new Types.ObjectId(id));
      const batchObjectIds = Array.from(targetBatchIds).map(
        (id) => new Types.ObjectId(id)
      );

      // 1. Place all unconsumed drums from affected lots/batches into Quarantine
      const holdableDrums = await DrumModel.find({
        $or: [
          ...(directDrum ? [{ _id: directDrum._id }] : []),
          { incomingLotId: { $in: lotObjectIds } },
          { reservedBatchId: { $in: batchObjectIds } },
        ],
        status: { $in: ['Approved', 'InWarehouse', 'Reserved', 'InWarmRoom'] },
      }).session(session);

      for (const drum of holdableDrums) {
        const prevStatus = drum.status;
        const prevLocation = drum.location;
        drum.status = 'Quarantine';
        drum.location = 'QuarantineZone';
        drum.reservedBatchId = null;
        await drum.save({ session });

        await StockMovementModel.create(
          [
            {
              movementType: 'RECEIVE_QUARANTINE',
              drumId: drum._id,
              incomingLotId: drum.incomingLotId,
              materialId: drum.materialId,
              country: drum.country,
              fromStatus: prevStatus,
              toStatus: 'Quarantine',
              fromLocation: prevLocation,
              toLocation: 'QuarantineZone',
              signedKg: 0,
              reason: `IFS Regulatory Hold on ${cleanCode}: ${reason}`,
              performedBy: actorObjectId,
            },
          ],
          { session }
        );
      }

      // 2. Place any non-shipped downstream ShipmentLots on QA_HOLD
      const holdableShipments = await ShipmentLotModel.find({
        $or: [
          ...(directShipment ? [{ _id: directShipment._id }] : []),
          { batchId: { $in: batchObjectIds } },
        ],
        status: { $nin: ['SHIPPED', 'VOID', 'QA_HOLD'] },
        isVoid: false,
      }).session(session);

      for (const shp of holdableShipments) {
        shp.status = 'QA_HOLD';
        await shp.save({ session });
      }

      // 3. Emit CRITICAL notification to Admin, Management, QA, Warehouse, Production
      await NotificationModel.create(
        [
          {
            type: 'DEVIATION_MISMATCH',
            severity: 'CRITICAL',
            title: `IFS Regulatory Hold Executed on ${cleanCode}`,
            message: `${holdableDrums.length} package(s) quarantined and ${holdableShipments.length} Shipment LOT(s) placed on QA_HOLD. Reason: ${reason}`,
            targetRoles: ['Admin', 'Management', 'QA_LEAD', 'WAREHOUSE', 'PLANT_OPERATOR'],
            entityType: 'BATCH',
            entityId:
              directBatch?._id ??
              directLot?._id ??
              directShipment?._id ??
              directDrum?._id ??
              directPackage?._id,
          },
        ],
        { session }
      );

      await recordAudit({
        actorId: userId,
        actorRole,
        module: 'trace',
        action: 'REGULATORY_HOLD',
        entityType: 'TRACE_CHAIN',
        entityId:
          directBatch?._id ??
          directLot?._id ??
          directShipment?._id ??
          (directDrum?._id || directPackage?._id)!,
        entityRef: cleanCode,
        after: {
          queriedCode: cleanCode,
          drumsQuarantined: holdableDrums.length,
          shipmentLotsHeld: holdableShipments.length,
        },
        reason,
        session,
      });

      return {
        queriedCode: cleanCode,
        drumsQuarantined: holdableDrums.length,
        shipmentLotsHeld: holdableShipments.length,
        heldAt: new Date().toISOString(),
      };
    });
  }
}
