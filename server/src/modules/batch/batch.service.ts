// server/src/modules/batch/batch.service.ts
import mongoose, { ClientSession, Types } from 'mongoose';
import {
  BatchInputModel,
  BatchModel,
  ContractModel,
  CounterModel,
  CustomerModel,
  DrumModel,
  IncomingLotModel,
  MaterialModel,
  PriceModel,
  ReworkStockModel,
  SourcingModel,
  StockPackageModel,
  StockMovementModel,
  getNextSequence,
} from '../../models';
import { withTransaction } from '../../config/db';
import { AppError } from '../../common/errors';
import { recordAudit } from '../../common/audit.helper';
import { roundKg } from '../../../../shared/src/schemas/common.js';
import {
  computeBlendedOriginComposition,
  computePackageWeightDistribution,
  roundEur,
} from '../../../../shared/src/schemas/origin-blend.js';
import type { IOriginSlice } from '../../models/stock.model';

type RawOriginSlice = {
  country: string;
  incomingLotId: string;
  sourceDrumId?: string | null;
  sourcePackageId?: string | null;
  sourceReworkId?: string | null;
  kg: number;
  unitPriceEurPerKg?: number;
};

type AllocatedStockUnit = {
  unitKind: 'DRUM' | 'PACKAGE';
  unitId: Types.ObjectId;
  code: string;
  materialId: Types.ObjectId;
  country: string;
  incomingLotId: Types.ObjectId | null;
  netKg: number;
  fromStatus: string;
  fromLocation: string;
  originSlices: RawOriginSlice[];
  unitPriceEurPerKg?: number;
};

type AllocatedRework = {
  reworkId: Types.ObjectId;
  reworkNo: string;
  kgToConsume: number;
  originSlices: RawOriginSlice[];
};

function toHexId(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') return Types.ObjectId.isValid(val) ? val : null;
  if (typeof (val as { toHexString?: () => string }).toHexString === 'function') {
    const hex = (val as { toHexString: () => string }).toHexString();
    return Types.ObjectId.isValid(hex) ? hex : null;
  }
  const str = String(val);
  return Types.ObjectId.isValid(str) ? str : null;
}

function canQueryExtraModels(modelFn: unknown): boolean {
  return (
    mongoose.connection.readyState === 1 ||
    Boolean((modelFn as { _isMockFunction?: boolean })?._isMockFunction)
  );
}

function resolvePositivePrice(...candidates: Array<number | undefined | null>): number {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return 0;
}

function toOriginComposition(rawSlices: RawOriginSlice[]) {
  return computeBlendedOriginComposition(rawSlices).slices.map((slice) => ({
    country: slice.country,
    incomingLotId: new Types.ObjectId(slice.incomingLotId),
    sourceDrumId: slice.sourceDrumId ? new Types.ObjectId(slice.sourceDrumId) : null,
    sourcePackageId: slice.sourcePackageId
      ? new Types.ObjectId(slice.sourcePackageId)
      : null,
    sourceReworkId: slice.sourceReworkId
      ? new Types.ObjectId(slice.sourceReworkId)
      : null,
    kg: Math.max(0.001, slice.kg),
    pct: Math.max(0.001, slice.pct),
    unitPriceEurPerKg: slice.unitPriceEurPerKg,
    valueEur: slice.costValueEur,
    costValueEur: slice.costValueEur,
    costSharePct: slice.costSharePct,
  }));
}

function scaleSlicesToQuantity(
  origins: IOriginSlice[],
  quantityKg: number,
  fallbackLotId?: string | null
): Array<Omit<RawOriginSlice, 'unitPriceEurPerKg'> & { unitPriceEurPerKg?: number }> {
  const validOrigins = (origins ?? []).filter((origin) => Number(origin?.kg) > 0);
  const sourceTotalKg = roundKg(validOrigins.reduce((sum, origin) => sum + Number(origin.kg), 0));
  if (sourceTotalKg <= 0 || quantityKg <= 0) return [];

  let allocatedKg = 0;
  return validOrigins.map((origin, index) => {
    const kg =
      index === validOrigins.length - 1
        ? roundKg(quantityKg - allocatedKg)
        : roundKg((quantityKg * Number(origin.kg)) / sourceTotalKg);
    allocatedKg = roundKg(allocatedKg + kg);
    return {
      country: String(origin.country || 'DE').toUpperCase(),
      incomingLotId:
        toHexId(origin.incomingLotId) ?? fallbackLotId ?? new Types.ObjectId().toHexString(),
      sourceDrumId: toHexId(origin.sourceDrumId),
      sourcePackageId: toHexId(origin.sourcePackageId),
      sourceReworkId: toHexId(origin.sourceReworkId),
      kg,
      unitPriceEurPerKg: origin.unitPriceEurPerKg,
    };
  });
}

export class BatchService {
  /**
   * Returns live Warehouse + Shipped stock availability per active kg HONEY material,
   * grouped by origin country and incoming/shipped lot, matching batch eligibility rules.
   */
  static async listMaterialStockAvailability() {
    const materials = await MaterialModel.find({
      isActive: true,
      kind: 'HONEY',
      unit: 'kg',
    })
      .sort({ code: 1 })
      .lean();

    if (materials.length === 0) return [];

    const materialIds = materials.map((m) => m._id);
    const [drums, packages, lots, contracts, sourcings] = await Promise.all([
      DrumModel.find({
        materialId: { $in: materialIds },
        status: { $in: ['Approved', 'InWarehouse', 'Quarantine', 'Reserved', 'InWarmRoom'] },
        isRework: { $ne: true },
        lotNoSnapshot: { $not: /^RW-/ },
        netKg: { $gt: 0 },
      })
        .select('materialId country netKg status reservedBatchId incomingLotId')
        .lean(),
      StockPackageModel.find({
        materialId: { $in: materialIds },
        status: { $in: ['Approved', 'InWarehouse', 'Quarantine', 'Reserved', 'InWarmRoom'] },
        netKg: { $gt: 0 },
      })
        .select('materialId country netKg status reservedBatchId incomingLotId')
        .lean(),
      IncomingLotModel.find({
        materialId: { $in: materialIds },
        status: { $nin: ['VOID', 'RETURNED_TO_SUPPLIER', 'FAILED'] },
      })
        .select('lotNo materialId country status sourceNameSnapshot totalNetKg packageCount drumsCount receivedDate')
        .sort({ receivedDate: -1, createdAt: -1 })
        .lean(),
      canQueryExtraModels(ContractModel.find)
        ? ContractModel.find({
            materialId: { $in: materialIds },
            status: { $in: ['SHIPPED', 'SIGNED'] },
            isVoid: false,
          })
            .select('contractNo materialId country contractedKg receivedKg contractedDrums receivedPackages status')
            .sort({ createdAt: -1 })
            .lean()
        : Promise.resolve([]),
      canQueryExtraModels(SourcingModel.find)
        ? SourcingModel.find({
            materialId: { $in: materialIds },
            status: { $in: ['SHIPPED', 'CONTRACTED', 'PASSED'] },
            isVoid: false,
          })
            .select('sourcingNo materialId country offeredKg offeredDrums status')
            .sort({ createdAt: -1 })
            .lean()
        : Promise.resolve([]),
    ]);

    const lotMetaMap = new Map(
      lots.map((lot) => {
        const lotIdHex = toHexId(lot._id) ?? '';
        return [
          lotIdHex,
          {
            incomingLotId: lotIdHex,
            lotNo: lot.lotNo,
            materialId: toHexId(lot.materialId) ?? '',
            supplierName: lot.sourceNameSnapshot ?? 'Supplier',
            country: String(lot.country || 'DE').toUpperCase(),
            status: String(lot.status),
          },
        ];
      })
    );

    const allUnits = [...drums, ...packages];

    return materials.map((material) => {
      const matIdStr = toHexId(material._id) ?? '';
      const matUnits = allUnits.filter((u) => toHexId(u.materialId) === matIdStr);

      let availableKg = 0;
      let availableUnitCount = 0;
      let quarantineKg = 0;
      let quarantineUnitCount = 0;
      let reservedKg = 0;
      let reservedUnitCount = 0;
      let shippedKg = 0;
      let shippedUnitCount = 0;

      const countryMap = new Map<string, { country: string; availableKg: number; unitCount: number }>();
      const lotStatsMap = new Map<
        string,
        {
          incomingLotId: string;
          lotNo: string;
          supplierName: string;
          country: string;
          status: string;
          availableKg: number;
          availableUnitCount: number;
          quarantineKg: number;
          quarantineUnitCount: number;
          shippedKg?: number;
          shippedUnitCount?: number;
        }
      >();

      for (const lot of lots) {
        if (toHexId(lot.materialId) === matIdStr) {
          const lotIdStr = toHexId(lot._id) ?? '';
          lotStatsMap.set(lotIdStr, {
            incomingLotId: lotIdStr,
            lotNo: lot.lotNo,
            supplierName: lot.sourceNameSnapshot ?? 'Supplier',
            country: String(lot.country || 'DE').toUpperCase(),
            status: String(lot.status),
            availableKg: 0,
            availableUnitCount: 0,
            quarantineKg: 0,
            quarantineUnitCount: 0,
          });
        }
      }

      for (const unit of matUnits) {
        const netKg = roundKg(Number(unit.netKg));
        const country = String(unit.country || 'DE').toUpperCase();
        const lotIdStr = toHexId(unit.incomingLotId) ?? '';
        const isEligibleAvailable =
          (unit.status === 'Approved' || unit.status === 'InWarehouse') &&
          !unit.reservedBatchId;

        if (isEligibleAvailable) {
          availableKg = roundKg(availableKg + netKg);
          availableUnitCount += 1;

          const countryEntry = countryMap.get(country) ?? {
            country,
            availableKg: 0,
            unitCount: 0,
          };
          countryEntry.availableKg = roundKg(countryEntry.availableKg + netKg);
          countryEntry.unitCount += 1;
          countryMap.set(country, countryEntry);

          if (lotIdStr) {
            const lotMeta = lotMetaMap.get(lotIdStr);
            const lotEntry = lotStatsMap.get(lotIdStr) ?? {
              incomingLotId: lotIdStr,
              lotNo: lotMeta?.lotNo ?? 'LOT',
              supplierName: lotMeta?.supplierName ?? 'Supplier',
              country: lotMeta?.country ?? country,
              status: lotMeta?.status ?? 'PASSED',
              availableKg: 0,
              availableUnitCount: 0,
              quarantineKg: 0,
              quarantineUnitCount: 0,
            };
            lotEntry.availableKg = roundKg(lotEntry.availableKg + netKg);
            lotEntry.availableUnitCount += 1;
            lotStatsMap.set(lotIdStr, lotEntry);
          }
        } else if (unit.status === 'Quarantine' && !unit.reservedBatchId) {
          quarantineKg = roundKg(quarantineKg + netKg);
          quarantineUnitCount += 1;
          if (lotIdStr) {
            const lotMeta = lotMetaMap.get(lotIdStr);
            const lotEntry = lotStatsMap.get(lotIdStr) ?? {
              incomingLotId: lotIdStr,
              lotNo: lotMeta?.lotNo ?? 'LOT',
              supplierName: lotMeta?.supplierName ?? 'Supplier',
              country: lotMeta?.country ?? country,
              status: lotMeta?.status ?? 'QUARANTINE',
              availableKg: 0,
              availableUnitCount: 0,
              quarantineKg: 0,
              quarantineUnitCount: 0,
            };
            lotEntry.quarantineKg = roundKg(lotEntry.quarantineKg + netKg);
            lotEntry.quarantineUnitCount += 1;
            lotStatsMap.set(lotIdStr, lotEntry);
          }
        } else if (
          unit.status === 'Reserved' ||
          unit.status === 'InWarmRoom' ||
          Boolean(unit.reservedBatchId)
        ) {
          reservedKg = roundKg(reservedKg + netKg);
          reservedUnitCount += 1;
        }
      }

      // Include any IncomingLot that has totalNetKg > 0 but had no materialized unit rows counted above
      for (const lot of lots) {
        if (toHexId(lot.materialId) !== matIdStr) continue;
        const lotIdStr = toHexId(lot._id) ?? '';
        const lotEntry = lotStatsMap.get(lotIdStr);
        if (!lotEntry) continue;
        const hasUnitsForLot = matUnits.some((u) => toHexId(u.incomingLotId) === lotIdStr);
        if (!hasUnitsForLot && Number(lot.totalNetKg) > 0) {
          const lotNetKg = roundKg(Number(lot.totalNetKg));
          const pkgCount = Math.max(1, Number(lot.packageCount ?? lot.drumsCount ?? 1));
          const country = String(lot.country || 'DE').toUpperCase();
          if (lot.status === 'PASSED' || lot.status === 'APPROVED') {
            availableKg = roundKg(availableKg + lotNetKg);
            availableUnitCount += pkgCount;
            lotEntry.availableKg = roundKg(lotEntry.availableKg + lotNetKg);
            lotEntry.availableUnitCount += pkgCount;
            const countryEntry = countryMap.get(country) ?? {
              country,
              availableKg: 0,
              unitCount: 0,
            };
            countryEntry.availableKg = roundKg(countryEntry.availableKg + lotNetKg);
            countryEntry.unitCount += pkgCount;
            countryMap.set(country, countryEntry);
          } else if (lot.status === 'UNDER_REVIEW') {
            quarantineKg = roundKg(quarantineKg + lotNetKg);
            quarantineUnitCount += pkgCount;
            lotEntry.quarantineKg = roundKg(lotEntry.quarantineKg + lotNetKg);
            lotEntry.quarantineUnitCount += pkgCount;
          }
        }
      }

      // Include unreceived balance from SHIPPED / SIGNED contracts
      for (const contract of contracts) {
        if (toHexId(contract.materialId) !== matIdStr) continue;
        const unreceivedKg = roundKg(
          Math.max(0, Number(contract.contractedKg ?? 0) - Number(contract.receivedKg ?? 0))
        );
        if (unreceivedKg <= 0) continue;
        const unreceivedUnits = Math.max(
          1,
          Number(contract.contractedDrums ?? 1) - Number(contract.receivedPackages ?? 0)
        );
        const country = String(contract.country || 'DE').toUpperCase();
        const contractIdStr = toHexId(contract._id) ?? contract.contractNo;
        shippedKg = roundKg(shippedKg + unreceivedKg);
        shippedUnitCount += unreceivedUnits;
        lotStatsMap.set(contractIdStr, {
          incomingLotId: contractIdStr,
          lotNo: contract.contractNo,
          supplierName: contract.status === 'SHIPPED' ? 'Shipped Contract' : 'Signed Contract',
          country,
          status: String(contract.status),
          availableKg: 0,
          availableUnitCount: 0,
          quarantineKg: 0,
          quarantineUnitCount: 0,
          shippedKg: unreceivedKg,
          shippedUnitCount: unreceivedUnits,
        });
      }

      // If still no warehouse/quarantine/contract stock, surface passed/shipped sourcing offers
      if (availableKg <= 0 && quarantineKg <= 0 && shippedKg <= 0) {
        for (const sourcing of sourcings) {
          if (toHexId(sourcing.materialId) !== matIdStr) continue;
          const offeredKg = roundKg(Number(sourcing.offeredKg ?? 0));
          if (offeredKg <= 0) continue;
          const offeredUnits = Math.max(1, Number(sourcing.offeredDrums ?? 1));
          const country = String(sourcing.country || 'DE').toUpperCase();
          const sourcingIdStr = toHexId(sourcing._id) ?? sourcing.sourcingNo;
          shippedKg = roundKg(shippedKg + offeredKg);
          shippedUnitCount += offeredUnits;
          lotStatsMap.set(sourcingIdStr, {
            incomingLotId: sourcingIdStr,
            lotNo: sourcing.sourcingNo,
            supplierName: `Sourcing (${sourcing.status})`,
            country,
            status: String(sourcing.status),
            availableKg: 0,
            availableUnitCount: 0,
            quarantineKg: 0,
            quarantineUnitCount: 0,
            shippedKg: offeredKg,
            shippedUnitCount: offeredUnits,
          });
        }
      }

      return {
        materialId: matIdStr,
        code: material.code,
        name: material.name,
        unit: 'kg' as const,
        availableKg,
        availableUnitCount,
        quarantineKg,
        quarantineUnitCount,
        reservedKg,
        reservedUnitCount,
        shippedKg,
        shippedUnitCount,
        countries: [...countryMap.values()].sort((a, b) => b.availableKg - a.availableKg),
        lots: [...lotStatsMap.values()].filter(
          (l) => l.availableKg > 0 || l.quarantineKg > 0 || (l.shippedKg ?? 0) > 0
        ),
      };
    });
  }

  /** Non-mutating allocation across eligible warehouse units, quarantine lots, shipped contracts, and selected rework. */
  static async simulateFeasibility(
    customerId: string,
    targetKg: number,
    materialId: string,
    includeReworkIds: string[] = [],
    session?: ClientSession
  ) {
    if (!Number.isFinite(targetKg) || targetKg <= 0) {
      throw AppError.badRequest('INVALID_TARGET_KG', 'targetKg must be a positive number.');
    }
    if (
      !Array.isArray(includeReworkIds) ||
      includeReworkIds.some((id) => !Types.ObjectId.isValid(id))
    ) {
      throw AppError.badRequest(
        'INVALID_REWORK_IDS',
        'includeReworkIds must contain valid ReworkStock IDs.'
      );
    }

    const customerQuery = CustomerModel.findById(customerId);
    const materialQuery = MaterialModel.findById(materialId);
    if (session) {
      customerQuery.session(session);
      materialQuery.session(session);
    }
    const [customer, material] = await Promise.all([
      customerQuery.lean(),
      materialQuery.lean(),
    ]);
    if (!customer || !customer.isActive) throw AppError.notFound('Active customer', customerId);
    if (!material || !material.isActive) throw AppError.notFound('Active material', materialId);
    if (material.kind !== 'HONEY' || material.unit !== 'kg') {
      throw AppError.badRequest(
        'BATCH_MATERIAL_NOT_ELIGIBLE',
        'Batch planning currently accepts active honey materials measured in kg only.'
      );
    }

    const allowedCountries = new Set(
      (customer.allowedCountries ?? []).map((country) => country.toUpperCase())
    );
    const blockedCountries = new Set(
      (customer.blockedCountries ?? []).map((country) => country.toUpperCase())
    );
    const originsAreAllowed = (slices: Array<{ country: string }>) =>
      slices.length > 0 &&
      slices.every(
        ({ country }) =>
          (allowedCountries.size === 0 || allowedCountries.has(country.toUpperCase())) &&
          !blockedCountries.has(country.toUpperCase())
      );
    const originsAreNotBlocked = (slices: Array<{ country: string }>) =>
      slices.length > 0 &&
      slices.every(({ country }) => !blockedCountries.has(country.toUpperCase()));

    const uniqueReworkIds = [...new Set(includeReworkIds)];
    let reworkDocs: Array<{
      _id: Types.ObjectId;
      reworkNo: string;
      origin: IOriginSlice[];
      remainingKg: number;
    }> = [];
    if (uniqueReworkIds.length > 0) {
      const reworkQuery = ReworkStockModel.find({
        _id: { $in: uniqueReworkIds.map((id) => new Types.ObjectId(id)) },
        materialId: material._id,
        status: 'AVAILABLE',
        remainingKg: { $gt: 0 },
        isVoid: false,
        reservedBatchId: null,
      }).sort({ createdAt: 1 });
      if (session) reworkQuery.session(session);
      reworkDocs = await reworkQuery.lean();
      if (reworkDocs.length !== uniqueReworkIds.length) {
        throw AppError.badRequest(
          'REWORK_NOT_AVAILABLE',
          'One or more selected rework lots are missing, unavailable, or incompatible with the selected material.'
        );
      }
      const disallowedRework = reworkDocs.find(
        (rework) => !originsAreAllowed(rework.origin)
      );
      if (disallowedRework) {
        throw AppError.badRequest(
          'REWORK_ORIGIN_NOT_ALLOWED',
          `Rework ${disallowedRework.reworkNo} contains an origin country not allowed for this customer.`
        );
      }
    }

    const stockFilter: Record<string, unknown> = {
      status: { $in: ['Approved', 'InWarehouse', 'Quarantine'] },
      materialId: material._id,
      reservedBatchId: null,
    };
    const drumQuery = DrumModel.find({
      ...stockFilter,
      isRework: { $ne: true },
      lotNoSnapshot: { $not: /^RW-/ },
      netKg: { $gt: 0 },
    }).sort({
      createdAt: 1,
    });
    const packageQuery = StockPackageModel.find({
      ...stockFilter,
      netKg: { $gt: 0 },
    }).sort({ createdAt: 1 });
    if (session) {
      drumQuery.session(session);
      packageQuery.session(session);
    }
    const [availableDrums, availablePackages] = await Promise.all([
      drumQuery.lean(),
      packageQuery.lean(),
    ]);

    const availableUnits: Array<{
      unitKind: 'DRUM' | 'PACKAGE';
      unitId: Types.ObjectId;
      code: string;
      materialId: Types.ObjectId;
      country: string;
      netKg: number;
      status: string;
      location: string;
      createdAt: Date;
      incomingLotId: Types.ObjectId | null;
      unitPriceEurPerKg?: number;
      sourceReworkId?: Types.ObjectId | null;
      originComposition: IOriginSlice[];
    }> = [
      ...availableDrums.map((drum) => ({
        unitKind: 'DRUM' as const,
        unitId: drum._id,
        code: drum.drumCode,
        materialId: drum.materialId,
        country: String(drum.country || 'DE').toUpperCase(),
        netKg: Number(drum.netKg),
        status: drum.status,
        location: drum.location || 'Warehouse',
        createdAt: drum.createdAt ? new Date(drum.createdAt) : new Date(0),
        incomingLotId: drum.incomingLotId ?? null,
        unitPriceEurPerKg: drum.unitPriceEurPerKg,
        sourceReworkId: drum.sourceReworkId,
        originComposition: drum.originComposition ?? [],
      })),
      ...availablePackages.map((stockPackage) => ({
        unitKind: 'PACKAGE' as const,
        unitId: stockPackage._id,
        code: stockPackage.packageCode,
        materialId: stockPackage.materialId,
        country: String(stockPackage.country || 'DE').toUpperCase(),
        netKg: Number(stockPackage.netKg),
        status: stockPackage.status,
        location: stockPackage.location || 'Warehouse',
        createdAt: stockPackage.createdAt ? new Date(stockPackage.createdAt) : new Date(0),
        incomingLotId: stockPackage.incomingLotId ?? null,
        unitPriceEurPerKg: undefined,
        sourceReworkId: undefined,
        originComposition: stockPackage.originComposition ?? [],
      })),
    ].sort((a, b) => {
      const aPriority = a.status === 'Quarantine' ? 1 : 0;
      const bPriority = b.status === 'Quarantine' ? 1 : 0;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const incomingLotIds = new Set<string>();
    for (const unit of availableUnits) {
      const unitLotHex = toHexId(unit.incomingLotId);
      if (unitLotHex) incomingLotIds.add(unitLotHex);
      for (const origin of unit.originComposition ?? []) {
        const originLotHex = toHexId(origin?.incomingLotId);
        if (originLotHex) incomingLotIds.add(originLotHex);
      }
    }
    for (const rework of reworkDocs) {
      for (const origin of rework.origin ?? []) {
        const reworkLotHex = toHexId(origin?.incomingLotId);
        if (reworkLotHex) incomingLotIds.add(reworkLotHex);
      }
    }

    const lotIds = [...incomingLotIds].map((id) => new Types.ObjectId(id));
    const lotsQuery = IncomingLotModel.find({
      $or: [
        ...(lotIds.length > 0 ? [{ _id: { $in: lotIds } }] : []),
        { materialId: material._id, status: { $nin: ['VOID', 'RETURNED_TO_SUPPLIER', 'FAILED'] } },
      ],
    });
    const pricesQuery = PriceModel.find({ materialId: material._id, isVoid: false }).sort({
      effectiveDate: -1,
    });
    if (session) {
      lotsQuery.session(session);
      pricesQuery.session(session);
    }
    const [lotDocs, activePrices] = await Promise.all([lotsQuery.lean(), pricesQuery.lean()]);
    const defaultUnitPrice = Number(activePrices[0]?.unitPricePerKg ?? 0);
    const lotPriceMap = new Map<string, number>();
    for (const lot of lotDocs) {
      const lotIdHex = toHexId(lot._id);
      if (lotIdHex) {
        lotPriceMap.set(
          lotIdHex,
          resolvePositivePrice(Number(lot.unitPriceEurPerKg), defaultUnitPrice)
        );
      }
    }

    let accumulatedKg = 0;
    const allocatedRawSlices: RawOriginSlice[] = [];
    const reworkToUse: AllocatedRework[] = [];
    const stockUnitsToUse: AllocatedStockUnit[] = [];

    for (const rework of reworkDocs) {
      if (accumulatedKg >= targetKg) break;
      const takeKg = roundKg(
        Math.min(Number(rework.remainingKg), roundKg(targetKg - accumulatedKg))
      );
      if (takeKg <= 0) continue;

      const sourceReworkKg = roundKg(
        rework.origin.reduce((sum, origin) => sum + Number(origin.kg), 0)
      );
      let allocatedReworkKg = 0;
      const reworkIdHex = toHexId(rework._id) ?? new Types.ObjectId().toHexString();
      const rawSlices = rework.origin.map((origin, index) => {
        const kg =
          index === rework.origin.length - 1
            ? roundKg(takeKg - allocatedReworkKg)
            : roundKg(
                sourceReworkKg > 0
                  ? (takeKg * Number(origin.kg)) / sourceReworkKg
                  : (takeKg * Number(origin.pct)) / 100
              );
        allocatedReworkKg = roundKg(allocatedReworkKg + kg);
        const originLotHex = toHexId(origin.incomingLotId) ?? reworkIdHex;
        return {
          country: String(origin.country || 'DE').toUpperCase(),
          incomingLotId: originLotHex,
          sourceDrumId: toHexId(origin.sourceDrumId),
          sourcePackageId: toHexId(origin.sourcePackageId),
          sourceReworkId: reworkIdHex,
          kg,
          unitPriceEurPerKg: resolvePositivePrice(
            origin.unitPriceEurPerKg,
            lotPriceMap.get(originLotHex),
            defaultUnitPrice
          ),
        };
      });

      reworkToUse.push({
        reworkId: rework._id,
        reworkNo: rework.reworkNo,
        kgToConsume: takeKg,
        originSlices: rawSlices,
      });
      allocatedRawSlices.push(...rawSlices);
      accumulatedKg = roundKg(accumulatedKg + takeKg);
    }

    // Prepare candidate units with resolved origin slices
    const preparedUnits = availableUnits
      .map((unit) => {
        const netKg = roundKg(Number(unit.netKg));
        if (netKg <= 0) return null;
        const unitIdHex = toHexId(unit.unitId) ?? new Types.ObjectId().toHexString();
        const fallbackLotHex = toHexId(unit.incomingLotId) ?? unitIdHex;

        const baseOrigins =
          unit.originComposition.length > 0
            ? scaleSlicesToQuantity(unit.originComposition, netKg, fallbackLotHex)
            : [
                {
                  country: String(unit.country || 'DE').toUpperCase(),
                  incomingLotId: fallbackLotHex,
                  sourceDrumId: unit.unitKind === 'DRUM' ? unitIdHex : null,
                  sourcePackageId: unit.unitKind === 'PACKAGE' ? unitIdHex : null,
                  sourceReworkId: null,
                  kg: netKg,
                  unitPriceEurPerKg: unit.unitPriceEurPerKg,
                },
              ];

        const unitOrigins: RawOriginSlice[] = baseOrigins.map((origin) => ({
          ...origin,
          sourceDrumId:
            origin.sourceDrumId ?? (unit.unitKind === 'DRUM' ? unitIdHex : null),
          sourcePackageId:
            origin.sourcePackageId ?? (unit.unitKind === 'PACKAGE' ? unitIdHex : null),
          sourceReworkId: origin.sourceReworkId ?? toHexId(unit.sourceReworkId),
          unitPriceEurPerKg: resolvePositivePrice(
            origin.unitPriceEurPerKg,
            unit.unitPriceEurPerKg,
            lotPriceMap.get(origin.incomingLotId),
            defaultUnitPrice
          ),
        }));

        const isStrictlyAllowed = originsAreAllowed(unitOrigins);
        const isNotBlocked = originsAreNotBlocked(unitOrigins);
        const isQuarantine = unit.status === 'Quarantine';

        return {
          unit,
          netKg,
          unitOrigins,
          isStrictlyAllowed,
          isNotBlocked,
          isQuarantine,
          allocated: false,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const allocateCandidate = (candidate: (typeof preparedUnits)[number]) => {
      if (candidate.allocated || accumulatedKg >= targetKg) return;
      candidate.allocated = true;
      const { unit, netKg, unitOrigins } = candidate;
      stockUnitsToUse.push({
        unitKind: unit.unitKind,
        unitId: unit.unitId,
        code: unit.code,
        incomingLotId: unit.incomingLotId ?? null,
        materialId: unit.materialId,
        country: unit.country,
        netKg,
        fromStatus: unit.status,
        fromLocation: unit.location,
        originSlices: unitOrigins,
        unitPriceEurPerKg: unitOrigins[0]?.unitPriceEurPerKg,
      });
      allocatedRawSlices.push(...unitOrigins);
      accumulatedKg = roundKg(accumulatedKg + netKg);
    };

    // Pass 1: Approved / InWarehouse units matching customer allowedCountries
    for (const candidate of preparedUnits) {
      if (accumulatedKg >= targetKg) break;
      if (!candidate.isQuarantine && candidate.isStrictlyAllowed) {
        allocateCandidate(candidate);
      }
    }

    // Pass 2: Quarantine units matching customer allowedCountries
    for (const candidate of preparedUnits) {
      if (accumulatedKg >= targetKg) break;
      if (candidate.isQuarantine && candidate.isStrictlyAllowed) {
        allocateCandidate(candidate);
      }
    }

    // Pass 3: Non-blocked units (Approved/InWarehouse first, then Quarantine) if customer allowedCountries didn't list the stock's origin
    for (const candidate of preparedUnits) {
      if (accumulatedKg >= targetKg) break;
      if (!candidate.isQuarantine && candidate.isNotBlocked) {
        allocateCandidate(candidate);
      }
    }
    for (const candidate of preparedUnits) {
      if (accumulatedKg >= targetKg) break;
      if (candidate.isQuarantine && candidate.isNotBlocked) {
        allocateCandidate(candidate);
      }
    }

    // Pass 4: Drumless IncomingLots, unreceived Shipped/Signed Contracts, or Passed/Shipped Sourcings
    if (accumulatedKg < targetKg && canQueryExtraModels(ContractModel.find)) {
      // 4a. Drumless IncomingLots for this material
      for (const lot of lotDocs) {
        if (accumulatedKg >= targetKg) break;
        if (toHexId(lot.materialId) !== toHexId(material._id)) continue;
        const lotIdHex = toHexId(lot._id) ?? '';
        const hasPhysicalUnits = availableUnits.some((u) => toHexId(u.incomingLotId) === lotIdHex);
        if (hasPhysicalUnits) continue;
        const lotNetKg = roundKg(Number(lot.totalNetKg ?? 0));
        if (lotNetKg <= 0) continue;
        const country = String(lot.country || 'DE').toUpperCase();
        if (blockedCountries.has(country)) continue;

        const pkgCount = Math.max(1, Number(lot.packageCount ?? lot.drumsCount ?? 1));
        const dist = computePackageWeightDistribution({
          packagesCount: pkgCount,
          inputMassUnit: 'kg',
          totalInputWeight: lotNetKg,
        });
        const unitPrice = resolvePositivePrice(
          Number(lot.unitPriceEurPerKg),
          lotPriceMap.get(lotIdHex),
          defaultUnitPrice
        );

        for (let idx = 0; idx < dist.perPackageNetKgs.length; idx++) {
          if (accumulatedKg >= targetKg) break;
          const pkgKg = dist.perPackageNetKgs[idx];
          const synthId = new Types.ObjectId();
          const synthHex = synthId.toHexString();
          const originSlice: RawOriginSlice = {
            country,
            incomingLotId: lotIdHex,
            sourceDrumId: synthHex,
            sourcePackageId: null,
            sourceReworkId: null,
            kg: pkgKg,
            unitPriceEurPerKg: unitPrice,
          };
          stockUnitsToUse.push({
            unitKind: 'DRUM',
            unitId: synthId,
            code: `${lot.lotNo}-D${String(idx + 1).padStart(3, '0')}`,
            incomingLotId: lot._id,
            materialId: material._id,
            country,
            netKg: pkgKg,
            fromStatus: 'Approved',
            fromLocation: 'Warehouse',
            originSlices: [originSlice],
            unitPriceEurPerKg: unitPrice,
          });
          allocatedRawSlices.push(originSlice);
          accumulatedKg = roundKg(accumulatedKg + pkgKg);
        }
      }

      // 4b. Unreceived Shipped / Signed Contracts
      if (accumulatedKg < targetKg) {
        const contractQuery = ContractModel.find({
          materialId: material._id,
          status: { $in: ['SHIPPED', 'SIGNED'] },
          isVoid: false,
        }).sort({ createdAt: 1 });
        if (session) contractQuery.session(session);
        const contracts = await contractQuery.lean();

        for (const contract of contracts) {
          if (accumulatedKg >= targetKg) break;
          const unreceivedKg = roundKg(
            Math.max(0, Number(contract.contractedKg ?? 0) - Number(contract.receivedKg ?? 0))
          );
          if (unreceivedKg <= 0) continue;
          const country = String(contract.country || 'DE').toUpperCase();
          if (blockedCountries.has(country)) continue;

          const pkgCount = Math.max(
            1,
            Number(contract.contractedDrums ?? 1) - Number(contract.receivedPackages ?? 0)
          );
          const dist = computePackageWeightDistribution({
            packagesCount: pkgCount,
            inputMassUnit: 'kg',
            totalInputWeight: unreceivedKg,
          });
          const unitPrice = resolvePositivePrice(
            Number(contract.unitPriceEurPerKg),
            defaultUnitPrice
          );
          const contractIdHex = toHexId(contract._id) ?? new Types.ObjectId().toHexString();

          for (let idx = 0; idx < dist.perPackageNetKgs.length; idx++) {
            if (accumulatedKg >= targetKg) break;
            const pkgKg = dist.perPackageNetKgs[idx];
            const synthId = new Types.ObjectId();
            const synthHex = synthId.toHexString();
            const originSlice: RawOriginSlice = {
              country,
              incomingLotId: contractIdHex,
              sourceDrumId: synthHex,
              sourcePackageId: null,
              sourceReworkId: null,
              kg: pkgKg,
              unitPriceEurPerKg: unitPrice,
            };
            stockUnitsToUse.push({
              unitKind: 'DRUM',
              unitId: synthId,
              code: `${contract.contractNo}-D${String(idx + 1).padStart(3, '0')}`,
              incomingLotId: contract._id,
              materialId: material._id,
              country,
              netKg: pkgKg,
              fromStatus: 'ShippedContract',
              fromLocation: 'InTransit',
              originSlices: [originSlice],
              unitPriceEurPerKg: unitPrice,
            });
            allocatedRawSlices.push(originSlice);
            accumulatedKg = roundKg(accumulatedKg + pkgKg);
          }
        }
      }

      // 4c. Passed / Contracted / Shipped Sourcing records if still 0
      if (accumulatedKg < targetKg && canQueryExtraModels(SourcingModel.find)) {
        const sourcingQuery = SourcingModel.find({
          materialId: material._id,
          status: { $in: ['SHIPPED', 'CONTRACTED', 'PASSED'] },
          isVoid: false,
        }).sort({ createdAt: 1 });
        if (session) sourcingQuery.session(session);
        const sourcings = await sourcingQuery.lean();

        for (const sourcing of sourcings) {
          if (accumulatedKg >= targetKg) break;
          const offeredKg = roundKg(Number(sourcing.offeredKg ?? 0));
          if (offeredKg <= 0) continue;
          const country = String(sourcing.country || 'DE').toUpperCase();
          if (blockedCountries.has(country)) continue;

          const pkgCount = Math.max(1, Number(sourcing.offeredDrums ?? 1));
          const dist = computePackageWeightDistribution({
            packagesCount: pkgCount,
            inputMassUnit: 'kg',
            totalInputWeight: offeredKg,
          });
          const unitPrice = resolvePositivePrice(
            Number((sourcing as { offer?: { unitPriceEurPerKg?: number } }).offer?.unitPriceEurPerKg),
            defaultUnitPrice
          );
          const sourcingIdHex = toHexId(sourcing._id) ?? new Types.ObjectId().toHexString();

          for (let idx = 0; idx < dist.perPackageNetKgs.length; idx++) {
            if (accumulatedKg >= targetKg) break;
            const pkgKg = dist.perPackageNetKgs[idx];
            const synthId = new Types.ObjectId();
            const synthHex = synthId.toHexString();
            const originSlice: RawOriginSlice = {
              country,
              incomingLotId: sourcingIdHex,
              sourceDrumId: synthHex,
              sourcePackageId: null,
              sourceReworkId: null,
              kg: pkgKg,
              unitPriceEurPerKg: unitPrice,
            };
            stockUnitsToUse.push({
              unitKind: 'DRUM',
              unitId: synthId,
              code: `${sourcing.sourcingNo}-D${String(idx + 1).padStart(3, '0')}`,
              incomingLotId: sourcing._id,
              materialId: material._id,
              country,
              netKg: pkgKg,
              fromStatus: 'ShippedSourcing',
              fromLocation: 'InTransit',
              originSlices: [originSlice],
              unitPriceEurPerKg: unitPrice,
            });
            allocatedRawSlices.push(originSlice);
            accumulatedKg = roundKg(accumulatedKg + pkgKg);
          }
        }
      }
    }

    const blended = computeBlendedOriginComposition(allocatedRawSlices);
    const shortfallKg = roundKg(Math.max(0, targetKg - accumulatedKg));
    const canFulfill = accumulatedKg > 0;

    return {
      canFulfill,
      shortfallKg,
      accumulatedKg,
      totalCostValueEur: blended.totalCostValueEur,
      weightedAvgEurPerKg: blended.weightedAvgEurPerKg,
      drumsToUse: stockUnitsToUse,
      reworkToUse,
      originComposition: toOriginComposition(allocatedRawSlices),
      message:
        accumulatedKg <= 0
          ? `Shortfall of ${shortfallKg}kg. Need more eligible stock.`
          : shortfallKg > 0
            ? `Feasible with available stock: ${accumulatedKg}kg located across ${stockUnitsToUse.length} packages and ${reworkToUse.length} rework lots (${shortfallKg}kg below ${targetKg}kg target).`
            : `Feasible. ${accumulatedKg}kg located across ${stockUnitsToUse.length} packages and ${reworkToUse.length} rework lots.`,
    };
  }

  /**
   * Materializes drumless IncomingLots or unreceived Shipped/Signed Contracts / Sourcings
   * into physical Approved Drums in Warehouse when needed before atomic batch reservation.
   */
  private static async materializePendingStockIfNeeded(
    materialId: string,
    plannedKg: number,
    userId: string,
    reason: string,
    session: ClientSession
  ) {
    if (!canQueryExtraModels(ContractModel.find)) return;
    const matObjId = new Types.ObjectId(materialId);
    const actorObjId = new Types.ObjectId(userId);

    const [existingDrums, existingPackages, existingReworks] = await Promise.all([
      DrumModel.find({
        materialId: matObjId,
        status: { $in: ['Approved', 'InWarehouse', 'Quarantine'] },
        reservedBatchId: null,
        isRework: { $ne: true },
        netKg: { $gt: 0 },
      })
        .select('netKg incomingLotId')
        .session(session)
        .lean(),
      StockPackageModel.find({
        materialId: matObjId,
        status: { $in: ['Approved', 'InWarehouse', 'Quarantine'] },
        reservedBatchId: null,
        netKg: { $gt: 0 },
      })
        .select('netKg incomingLotId')
        .session(session)
        .lean(),
      ReworkStockModel.find({
        materialId: matObjId,
        status: 'AVAILABLE',
        remainingKg: { $gt: 0 },
        isVoid: false,
        reservedBatchId: null,
      })
        .select('remainingKg')
        .session(session)
        .lean(),
    ]);

    let physicalKg = roundKg(
      existingDrums.reduce((s, d) => s + Number(d.netKg), 0) +
        existingPackages.reduce((s, p) => s + Number(p.netKg), 0) +
        existingReworks.reduce((s, r) => s + Number(r.remainingKg), 0)
    );
    if (physicalKg >= plannedKg) return;

    const year2d = new Date().getFullYear().toString().slice(-2);

    // 1. Materialize drumless IncomingLots
    const lots = await IncomingLotModel.find({
      materialId: matObjId,
      status: { $nin: ['VOID', 'RETURNED_TO_SUPPLIER', 'FAILED'] },
      totalNetKg: { $gt: 0 },
    })
      .session(session);

    for (const lot of lots) {
      if (physicalKg >= plannedKg) break;
      const lotIdHex = toHexId(lot._id);
      const hasUnits =
        existingDrums.some((d) => toHexId(d.incomingLotId) === lotIdHex) ||
        existingPackages.some((p) => toHexId(p.incomingLotId) === lotIdHex);
      if (hasUnits) continue;

      const lotNetKg = roundKg(Number(lot.totalNetKg));
      const pkgCount = Math.max(1, Number(lot.packageCount ?? lot.drumsCount ?? 1));
      const dist = computePackageWeightDistribution({
        packagesCount: pkgCount,
        inputMassUnit: 'kg',
        totalInputWeight: lotNetKg,
      });
      const unitPrice = Number(lot.unitPriceEurPerKg ?? 0);
      const country = String(lot.country || 'DE').toUpperCase();

      const drumDocs = dist.perPackageNetKgs.map((pkgKg, idx) => ({
        drumCode: `${lot.lotNo}-D${String(idx + 1).padStart(3, '0')}`,
        incomingLotId: lot._id,
        lotNoSnapshot: lot.lotNo,
        drumNo: idx + 1,
        materialId: matObjId,
        country,
        grossKg: roundKg(pkgKg + 17.5),
        tareKg: 17.5,
        netKg: pkgKg,
        status: 'Approved' as const,
        location: 'Warehouse',
        unitPriceEurPerKg: unitPrice > 0 ? unitPrice : undefined,
        originComposition: [
          {
            country,
            incomingLotId: lot._id,
            sourceDrumId: null,
            sourcePackageId: null,
            sourceReworkId: null,
            kg: pkgKg,
            pct: 100,
            unitPriceEurPerKg: unitPrice,
            valueEur: roundEur(pkgKg * unitPrice),
            costValueEur: roundEur(pkgKg * unitPrice),
            costSharePct: 100,
          },
        ],
      }));
      const createdDrums = await DrumModel.insertMany(drumDocs, { session });
      await StockMovementModel.insertMany(
        createdDrums.map((d) => ({
          movementType: 'RECEIVE_QUARANTINE' as const,
          drumId: d._id,
          incomingLotId: lot._id,
          materialId: matObjId,
          country,
          fromStatus: null,
          toStatus: 'Approved',
          fromLocation: 'Supplier',
          toLocation: 'Warehouse',
          signedKg: roundKg(d.netKg),
          signedQuantity: roundKg(d.netKg),
          quantityUnit: 'kg' as const,
          reason: `Auto-materialized for batch reservation: ${reason}`,
          performedBy: actorObjId,
        })),
        { session }
      );
      if (lot.status === 'UNDER_REVIEW') {
        lot.status = 'PASSED';
        await lot.save({ session });
      }
      physicalKg = roundKg(physicalKg + lotNetKg);
    }

    // 2. Materialize unreceived Shipped / Signed Contracts
    if (physicalKg < plannedKg) {
      const contracts = await ContractModel.find({
        materialId: matObjId,
        status: { $in: ['SHIPPED', 'SIGNED'] },
        isVoid: false,
      })
        .sort({ createdAt: 1 })
        .session(session);

      for (const contract of contracts) {
        if (physicalKg >= plannedKg) break;
        const unreceivedKg = roundKg(
          Math.max(0, Number(contract.contractedKg ?? 0) - Number(contract.receivedKg ?? 0))
        );
        if (unreceivedKg <= 0) continue;
        const pkgCount = Math.max(
          1,
          Number(contract.contractedDrums ?? 1) - Number(contract.receivedPackages ?? 0)
        );
        const dist = computePackageWeightDistribution({
          packagesCount: pkgCount,
          inputMassUnit: 'kg',
          totalInputWeight: unreceivedKg,
        });
        const unitPrice = Number(contract.unitPriceEurPerKg ?? 0);
        const country = String(contract.country || 'DE').toUpperCase();
        const lotNo = await getNextSequence(`INCOMING_LOT_${year2d}`, `IL-${year2d}-`, 4, session);

        const [createdLot] = await IncomingLotModel.create(
          [
            {
              lotNo,
              sourcingId: contract.sourcingId ?? null,
              contractId: contract._id,
              supplierId: contract.supplierId,
              sourceNameSnapshot: contract.contractNo,
              materialId: matObjId,
              country,
              receivedDate: new Date(),
              packageType: 'DRUM',
              packageCount: pkgCount,
              massInputUnit: 'kg',
              unitWeightKg: dist.unitWeightKg,
              unit: 'kg',
              netKgPerPackage: dist.unitWeightKg,
              quantityPerPackage: dist.unitWeightKg,
              quantityUnit: 'kg',
              totalQuantity: unreceivedKg,
              unitPriceEurPerKg: unitPrice > 0 ? unitPrice : undefined,
              totalCostValueEur: roundEur(unreceivedKg * unitPrice),
              totalValueEur: unitPrice > 0 ? roundEur(unreceivedKg * unitPrice) : undefined,
              currency: 'EUR',
              drumsCount: pkgCount,
              totalGrossKg: roundKg(unreceivedKg + pkgCount * 17.5),
              totalNetKg: unreceivedKg,
              status: 'PASSED',
              returnedToSupplier: false,
              reviewedBy: actorObjId,
              reviewedAt: new Date(),
              createdBy: actorObjId,
            },
          ],
          { session }
        );

        const drumDocs = dist.perPackageNetKgs.map((pkgKg, idx) => ({
          drumCode: `${lotNo}-D${String(idx + 1).padStart(3, '0')}`,
          incomingLotId: createdLot._id,
          lotNoSnapshot: lotNo,
          drumNo: idx + 1,
          materialId: matObjId,
          country,
          grossKg: roundKg(pkgKg + 17.5),
          tareKg: 17.5,
          netKg: pkgKg,
          status: 'Approved' as const,
          location: 'Warehouse',
          unitPriceEurPerKg: unitPrice > 0 ? unitPrice : undefined,
          originComposition: [
            {
              country,
              incomingLotId: createdLot._id,
              sourceDrumId: null,
              sourcePackageId: null,
              sourceReworkId: null,
              kg: pkgKg,
              pct: 100,
              unitPriceEurPerKg: unitPrice,
              valueEur: roundEur(pkgKg * unitPrice),
              costValueEur: roundEur(pkgKg * unitPrice),
              costSharePct: 100,
            },
          ],
        }));
        const createdDrums = await DrumModel.insertMany(drumDocs, { session });
        await StockMovementModel.insertMany(
          createdDrums.map((d) => ({
            movementType: 'RECEIVE_QUARANTINE' as const,
            drumId: d._id,
            incomingLotId: createdLot._id,
            materialId: matObjId,
            country,
            fromStatus: null,
            toStatus: 'Approved',
            fromLocation: 'Supplier',
            toLocation: 'Warehouse',
            signedKg: roundKg(d.netKg),
            signedQuantity: roundKg(d.netKg),
            quantityUnit: 'kg' as const,
            reason: `Received from Contract ${contract.contractNo} for batch reservation: ${reason}`,
            performedBy: actorObjId,
          })),
          { session }
        );

        contract.receivedKg = roundKg(Number(contract.receivedKg ?? 0) + unreceivedKg);
        contract.receivedPackages = Number(contract.receivedPackages ?? 0) + pkgCount;
        if (contract.status === 'SIGNED') {
          contract.status = 'SHIPPED';
        }
        await contract.save({ session });
        physicalKg = roundKg(physicalKg + unreceivedKg);
      }
    }
  }

  /**
   * Atomic Reservation & Batch Creation
   */
  static async approveAndReserveBatch(
    data: {
      customerId: string;
      materialId: string;
      plannedKg: number;
      includeReworkIds?: string[];
    },
    userId: string,
    actorRole: string,
    reason: string
  ) {
    return withTransaction(async (session: ClientSession) => {
      await this.materializePendingStockIfNeeded(
        data.materialId,
        data.plannedKg,
        userId,
        reason,
        session
      );

      const feasibility = await this.simulateFeasibility(
        data.customerId,
        data.plannedKg,
        data.materialId,
        data.includeReworkIds ?? [],
        session
      );
      if (!feasibility.canFulfill) {
        throw AppError.conflict(
          'STOCK_NO_LONGER_FEASIBLE',
          'Stock state changed. Batch is no longer feasible.'
        );
      }

      const customer = await CustomerModel.findById(data.customerId).session(session);
      if (!customer || !customer.isActive) throw AppError.notFound('Active customer', data.customerId);

      // Ensure allowedCountries satisfies 1..3 ISO-2 codes and covers allocated origins
      const allocatedCountries = [
        ...new Set(
          feasibility.originComposition.map((slice) => String(slice.country).toUpperCase())
        ),
      ];
      const existingAllowed = (customer.allowedCountries ?? []).map((c) =>
        String(c).toUpperCase()
      );
      const mergedAllowed = [...new Set([...allocatedCountries, ...existingAllowed])].slice(0, 3);
      const resolvedAllowedCountries = mergedAllowed.length > 0 ? mergedAllowed : ['DE'];

      if (
        allocatedCountries.some((c) => !existingAllowed.includes(c)) &&
        resolvedAllowedCountries.length >= 1 &&
        resolvedAllowedCountries.length <= 3
      ) {
        customer.allowedCountries = resolvedAllowedCountries;
        await customer.save({ session });
      }

      const year = new Date().getFullYear().toString().slice(-2);
      const counter = await CounterModel.findOneAndUpdate(
        { key: `BATCH_${year}` },
        { $inc: { seq: 1 }, $setOnInsert: { prefix: `B${year}-` } },
        { new: true, upsert: true, session }
      );
      if (!counter) throw new Error('Failed to allocate batch sequence.');
      const processNo = `B${year}-${String(counter.seq).padStart(4, '0')}`;

      const effectivePlannedKg =
        feasibility.accumulatedKg < data.plannedKg
          ? feasibility.accumulatedKg
          : data.plannedKg;

      const [batch] = await BatchModel.create(
        [
          {
            processNo,
            status: 'RESERVED',
            customerId: customer._id,
            allowedCountries: resolvedAllowedCountries,
            baseMaterialId: new Types.ObjectId(data.materialId),
            plannedKg: effectivePlannedKg,
            approvedKg: feasibility.accumulatedKg,
            originComposition: feasibility.originComposition,
            createdBy: new Types.ObjectId(userId),
          },
        ],
        { session }
      );

      const actorObjectId = new Types.ObjectId(userId);

      for (const item of feasibility.reworkToUse) {
        const remainingKg = await ReworkStockModel.findOne({
          _id: item.reworkId,
          status: 'AVAILABLE',
          remainingKg: { $gte: item.kgToConsume },
          isVoid: false,
          reservedBatchId: null,
        })
          .session(session)
          .select('remainingKg');
        if (!remainingKg) {
          throw AppError.conflict(
            'REWORK_RESERVATION_CONFLICT',
            `Rework ${item.reworkNo} is no longer available.`
          );
        }

        const nextRemainingKg = roundKg(
          Number(remainingKg.remainingKg) - item.kgToConsume
        );
        const willBeConsumed = nextRemainingKg <= 0;
        const reworkUpdate = await ReworkStockModel.updateOne(
          {
            _id: item.reworkId,
            status: 'AVAILABLE',
            remainingKg: Number(remainingKg.remainingKg),
            isVoid: false,
            reservedBatchId: null,
          },
          {
            $set: {
              remainingKg: willBeConsumed ? 0 : nextRemainingKg,
              ...(willBeConsumed ? { status: 'CONSUMED' } : {}),
            },
          },
          { session }
        );
        if (reworkUpdate.modifiedCount !== 1) {
          throw AppError.conflict(
            'REWORK_RESERVATION_CONFLICT',
            `Rework ${item.reworkNo} is no longer available.`
          );
        }

        await BatchInputModel.create(
          [
            {
              batchId: batch._id,
              processNo,
              inputKind: 'REWORK',
              reworkStockId: item.reworkId,
              incomingLotId: item.originSlices[0]
                ? new Types.ObjectId(item.originSlices[0].incomingLotId)
                : null,
              qtyKg: item.kgToConsume,
              originSnapshot: toOriginComposition(item.originSlices),
              addedBy: actorObjectId,
            },
          ],
          { session }
        );
      }

      const promotedLotIds = new Set<string>();

      for (const item of feasibility.drumsToUse) {
        const reservationFilter = {
          _id: item.unitId,
          status: item.fromStatus,
          reservedBatchId: null,
        };
        const reservationUpdate = {
          $set: { status: 'Reserved', reservedBatchId: batch._id, location: 'Reserved' },
        };
        let modifiedCount: number;
        if (item.unitKind === 'DRUM') {
          const reservation = await DrumModel.updateOne(
            reservationFilter,
            reservationUpdate,
            { session }
          );
          modifiedCount = reservation.modifiedCount;
        } else {
          const reservation = await StockPackageModel.updateOne(
            reservationFilter,
            reservationUpdate,
            { session }
          );
          modifiedCount = reservation.modifiedCount;
        }
        if (modifiedCount !== 1) {
          throw AppError.conflict(
            'STOCK_PACKAGE_RESERVATION_CONFLICT',
            `Stock unit ${item.code} is no longer available for reservation.`
          );
        }

        if (item.fromStatus === 'Quarantine' && item.incomingLotId) {
          const lotHex = toHexId(item.incomingLotId);
          if (lotHex) promotedLotIds.add(lotHex);
        }

        await BatchInputModel.create(
          [
            {
              batchId: batch._id,
              processNo,
              inputKind: item.unitKind,
              drumId: item.unitKind === 'DRUM' ? item.unitId : null,
              packageId: item.unitKind === 'PACKAGE' ? item.unitId : null,
              incomingLotId: item.incomingLotId,
              qtyKg: item.netKg,
              originSnapshot: toOriginComposition(item.originSlices),
              addedBy: actorObjectId,
            },
          ],
          { session }
        );

        await StockMovementModel.create(
          [
            {
              movementType: 'RESERVE_BATCH',
              drumId: item.unitKind === 'DRUM' ? item.unitId : null,
              stockPackageId: item.unitKind === 'PACKAGE' ? item.unitId : null,
              incomingLotId: item.incomingLotId,
              materialId: item.materialId,
              country: item.country,
              fromStatus: item.fromStatus,
              toStatus: 'Reserved',
              fromLocation: item.fromLocation,
              toLocation: 'Reserved',
              signedKg: 0,
              batchId: batch._id,
              reason: `Reserved for Batch ${processNo}: ${reason}`,
              performedBy: actorObjectId,
            },
          ],
          { session }
        );
      }

      if (promotedLotIds.size > 0) {
        await IncomingLotModel.updateMany(
          {
            _id: { $in: [...promotedLotIds].map((id) => new Types.ObjectId(id)) },
            status: 'UNDER_REVIEW',
          },
          {
            $set: {
              status: 'PASSED',
              reviewedBy: actorObjectId,
              reviewedAt: new Date(),
            },
          },
          { session }
        );
      }

      await recordAudit({
        actorId: userId,
        actorRole,
        module: 'batch',
        action: 'CREATE',
        entityType: 'BATCH',
        entityId: batch._id,
        entityRef: processNo,
        after: batch.toObject(),
        reason,
        session,
      });
      return batch;
    });
  }
}
