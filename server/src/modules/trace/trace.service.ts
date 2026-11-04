import { ClientSession, Types } from 'mongoose';
import { withSnapshotRead } from '../../config/db';
import { AppError } from '../../common/errors';
import {
  canRoleViewPrices,
  sanitizeOriginSlicesForRole,
} from '../../common/price-strip.helper';
import {
  BatchInputModel,
  BatchModel,
  CustomerModel,
  DrumModel,
  IncomingLotModel,
  ProcessStepModel,
  ReworkStockModel,
  ShipmentLotModel,
  StockMovementModel,
  StockPackageModel,
} from '../../models';

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
      ...sanitized['labelData'] as Record<string, unknown>,
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
      ? { ...sanitized.labelData as Record<string, unknown> }
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
      ? { ...sanitized.labelMetadata as Record<string, unknown> }
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

function idsAsObjectIds(ids: Set<string>): Types.ObjectId[] {
  return [...ids].map((id) => new Types.ObjectId(id));
}

export class TraceService {
  /**
   * Snapshot-isolated bi-directional trace; R9 price fields and Inspector
   * counterparty names are filtered before the response leaves the service.
   */
  static async traceByReference(queryCode: string, actorRole: string) {
    const cleanCode = queryCode.trim().toUpperCase();
    if (!cleanCode) {
      throw AppError.badRequest(
        'INVALID_TRACE_CODE',
        'Provide a non-empty reference code.'
      );
    }

    const showPrices = canRoleViewPrices(actorRole);
    const isInspector = actorRole === 'Inspector' || actorRole === 'INSPECTOR';

    return withSnapshotRead(async (session: ClientSession) => {
      const directLot = await IncomingLotModel.findOne({ lotNo: cleanCode })
        .session(session)
        .lean();
      const directDrum = await DrumModel.findOne({
        $or: [{ drumCode: cleanCode }, { barcode: cleanCode }],
      })
        .session(session)
        .lean();
      const directPackage = await StockPackageModel.findOne({
        packageCode: cleanCode,
      })
        .session(session)
        .lean();
      const directBatch = await BatchModel.findOne({
        processNo: cleanCode,
        isVoid: false,
      })
        .session(session)
        .lean();
      const directRework = await ReworkStockModel.findOne({
        reworkNo: cleanCode,
        isVoid: false,
      })
        .session(session)
        .lean();
      const directShipment = await ShipmentLotModel.findOne({
        shipmentLotNo: cleanCode,
        isVoid: false,
      })
        .session(session)
        .lean();

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

      const batchObjectIds = idsAsObjectIds(batchIds);
      const batches = await BatchModel.find({
        _id: { $in: batchObjectIds },
        isVoid: false,
      })
        .session(session)
        .lean();
      const batchInputs = await BatchInputModel.find({
        batchId: { $in: batchObjectIds },
        isVoid: false,
      })
        .session(session)
        .lean();
      const processSteps = await ProcessStepModel.find({
        batchId: { $in: batchObjectIds },
        isVoid: false,
      })
        .sort({ stepSequence: 1 })
        .session(session)
        .lean();
      const shipmentLots = await ShipmentLotModel.find({
        batchId: { $in: batchObjectIds },
        isVoid: false,
      })
        .session(session)
        .lean();
      const reworkStocks = await ReworkStockModel.find({
        $or: [
          { sourceBatchId: { $in: batchObjectIds } },
          {
            _id: {
              $in: batchInputs
                .map((input) => input.reworkStockId)
                .filter((id): id is Types.ObjectId => Boolean(id)),
            },
          },
          ...(directRework ? [{ _id: directRework._id }] : []),
        ],
        isVoid: false,
      })
        .sort({ createdAt: 1 })
        .session(session)
        .lean();

      const incomingLotIds = new Set<string>();
      if (directLot) incomingLotIds.add(String(directLot._id));
      if (directDrum?.incomingLotId) {
        incomingLotIds.add(String(directDrum.incomingLotId));
      }
      if (directPackage?.incomingLotId) {
        incomingLotIds.add(String(directPackage.incomingLotId));
      }
      for (const input of batchInputs) {
        if (input.incomingLotId) incomingLotIds.add(String(input.incomingLotId));
        for (const slice of input.originSnapshot ?? []) {
          incomingLotIds.add(String(slice.incomingLotId));
        }
      }
      for (const batch of batches) {
        for (const slice of batch.originComposition ?? []) {
          incomingLotIds.add(String(slice.incomingLotId));
        }
      }
      for (const rework of reworkStocks) {
        for (const slice of rework.origin ?? []) {
          incomingLotIds.add(String(slice.incomingLotId));
        }
      }

      const lotObjectIds = idsAsObjectIds(incomingLotIds);
      const relatedStockQuery = {
        incomingLotId: { $in: lotObjectIds },
      };
      const incomingLots = await IncomingLotModel.find({
        _id: { $in: lotObjectIds },
      })
        .session(session)
        .lean();
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
      const stockPackages = await StockPackageModel.find({
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

      if (
        !directLot &&
        !directDrum &&
        !directPackage &&
        !directBatch &&
        !directRework &&
        !directShipment
      ) {
        throw AppError.notFound('Traceable entity', cleanCode);
      }

      const customers = await CustomerModel.find({
        _id: { $in: shipmentLots.map((shipment) => shipment.customerId) },
      })
        .session(session)
        .lean();
      const sanitizedCustomers = customers.map((customer) => ({
        _id: customer._id,
        code: customer.code,
        name: isInspector
          ? `INSPECTOR-REDACTED-${customer.country}`
          : customer.name,
        country: customer.country,
        allowedCountries: customer.allowedCountries,
      }));

      return {
        queriedCode: cleanCode,
        inspectorMode: isInspector,
        pricesVisible: showPrices,
        snapshotAt: new Date().toISOString(),
        upstream: {
          incomingLots: incomingLots.map((lot) =>
            sanitizeIncomingLot(
              lot as unknown as Record<string, unknown>,
              lot.country,
              showPrices,
              isInspector
            )
          ),
          drumsCount: drums.length,
          drums: drums.map((drum) => ({
            ...sanitizeRecord(
              drum as unknown as Record<string, unknown>,
              showPrices
            ),
            originComposition: sanitizeOriginSlicesForRole(
              drum.originComposition ?? [],
              actorRole
            ),
          })),
          packages: stockPackages.map((stockPackage) => ({
            ...sanitizeRecord(
              stockPackage as unknown as Record<string, unknown>,
              showPrices
            ),
            originComposition: sanitizeOriginSlicesForRole(
              stockPackage.originComposition ?? [],
              actorRole
            ),
          })),
        },
        production: {
          batches: batches.map((batch) => ({
            ...sanitizeRecord(
              batch as unknown as Record<string, unknown>,
              showPrices
            ),
            originComposition: sanitizeOriginSlicesForRole(
              batch.originComposition ?? [],
              actorRole
            ),
          })),
          batchInputs: batchInputs.map((input) => ({
            ...sanitizeRecord(
              input as unknown as Record<string, unknown>,
              showPrices
            ),
            originSnapshot: sanitizeOriginSlicesForRole(
              input.originSnapshot ?? [],
              actorRole
            ),
          })),
          processSteps,
          reworkStocks: reworkStocks.map((rework) => ({
            ...sanitizeRecord(
              rework as unknown as Record<string, unknown>,
              showPrices
            ),
            origin: sanitizeOriginSlicesForRole(rework.origin ?? [], actorRole),
          })),
        },
        downstream: {
          shipmentLots: shipmentLots.map((shipment) => ({
            ...sanitizeRecord(
              shipment as unknown as Record<string, unknown>,
              showPrices
            ),
            originComposition: sanitizeOriginSlicesForRole(
              shipment.originComposition ?? [],
              actorRole
            ),
          })),
          customers: sanitizedCustomers,
        },
        ledgerMovements: stockMovements,
      };
    });
  }

  static async traceEntity(queryCode: string, actorRole: string) {
    return this.traceByReference(queryCode, actorRole);
  }
}
