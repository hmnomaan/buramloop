// server/src/modules/sourcing/sourcing.service.ts
import { Request } from 'express';
import { ClientSession, Types } from 'mongoose';
import { withTransaction } from '../../config/db';
import { AppError } from '../../common/errors';
import { recordAudit } from '../../common/audit.helper';
import { hasPermission } from '../../middlewares/rbac.middleware';
import { canRoleViewPrices } from '../../common/price-strip.helper';
import {
  SourcingModel,
  ContractModel,
  PriceModel,
  SupplierModel,
  MaterialModel,
  CounterModel,
} from '../../models';
import {
  CreateSourcingInput,
  CreateContractFromSourcingInput,
  CreateSupplierLeadInput,
  EvaluateSourcingGateInput,
  normalizeSourcingOfferMetrics,
  SOURCING_GATES,
  SOURCING_GATE_PERMISSIONS,
  SupplierLeadStatus,
  UpdateSupplierLeadStatusInput,
} from '../../../../shared/src/schemas/purchase';
import { roundKg } from '../../../../shared/src/schemas/common';
import { roundEur } from '../../../../shared/src/schemas/origin-blend';

export class SourcingService {
  /**
   * Generates atomic year-scoped sequence numbers (e.g., SRC-26-0001, CT-26-0001)
   */
  private async nextSequence(key: string, prefix: string, session: ClientSession): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const counterKey = `${key}_${year}`;
    const doc = await CounterModel.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 }, $setOnInsert: { prefix: `${prefix}-${year}-` } },
      { upsert: true, new: true, session }
    );
    if (!doc) {
      throw new Error(`Failed to allocate sequence for ${counterKey}.`);
    }
    return `${prefix}-${year}-${String(doc.seq).padStart(4, '0')}`;
  }

  async listSupplierLeads(
    req: Request,
    filters: { country?: string; search?: string; leadStatus?: SupplierLeadStatus } = {}
  ): Promise<unknown[]> {
    const showPrices = canRoleViewPrices(req.user?.roleName ?? '');
    const query: Record<string, unknown> = {};
    if (filters.country) query.country = filters.country.trim().toUpperCase();
    if (filters.leadStatus) query.leadStatus = filters.leadStatus;
    if (filters.search?.trim()) {
      const escapedSearch = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const search = new RegExp(escapedSearch, 'i');
      query.$or = [
        { name: search },
        { code: search },
        { regionCity: search },
        { country: search },
      ];
    }

    const suppliers = await SupplierModel.find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(200)
      .lean();
    const supplierIds = suppliers.map((supplier) => supplier._id);
    const sourcings = await SourcingModel.find({
      supplierId: { $in: supplierIds },
      isVoid: false,
    })
      .sort({ createdAt: -1 })
      .lean();
    const prices = showPrices
      ? await PriceModel.find({
          supplierId: { $in: supplierIds },
          isVoid: false,
        })
          .sort({ effectiveDate: -1 })
          .lean()
      : [];
    const offersBySupplier = new Map<string, typeof sourcings>();
    for (const sourcing of sourcings) {
      const key = String(sourcing.supplierId);
      offersBySupplier.set(key, [...(offersBySupplier.get(key) ?? []), sourcing]);
    }
    const latestPriceBySupplier = new Map<string, (typeof prices)[number]>();
    for (const price of prices) {
      const key = String(price.supplierId);
      if (!latestPriceBySupplier.has(key)) latestPriceBySupplier.set(key, price);
    }

    return suppliers.map((supplier) => {
      const offers = offersBySupplier.get(String(supplier._id)) ?? [];
      const latestPrice = latestPriceBySupplier.get(String(supplier._id));
      return {
        ...supplier,
        offersCount: offers.length,
        passedOffersCount: offers.filter((offer) =>
          ['PASSED', 'CONTRACTED', 'SHIPPED'].includes(offer.status)
        ).length,
        rejectedOffersCount: offers.filter((offer) => offer.status === 'REJECTED').length,
        latestOfferAt: offers[0]?.createdAt ?? null,
        ...(showPrices
          ? {
              latestPriceEurPerKg:
                latestPrice?.landedUnitPriceEurPerKg ??
                latestPrice?.unitPricePerKg ??
                null,
            }
          : {}),
      };
    });
  }

  async createSupplierLead(req: Request, payload: CreateSupplierLeadInput) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      const code =
        payload.code?.trim().toUpperCase() ??
        (await this.nextSequence('SUPPLIER_LEAD', 'SUP', session));
      if (await SupplierModel.findOne({ code }).session(session)) {
        throw AppError.conflict(
          'SUPPLIER_CODE_EXISTS',
          `Supplier code ${code} already exists.`
        );
      }

      const [supplier] = await SupplierModel.create(
        [
          {
            code,
            name: payload.name.trim(),
            country: payload.country.toUpperCase(),
            regionCity: payload.regionCity?.trim() || undefined,
            contactPerson: payload.contactPerson?.trim() || undefined,
            contactName: payload.contactPerson?.trim() || undefined,
            contactEmail: payload.email?.trim() || undefined,
            contactPhone: payload.phone?.trim() || undefined,
            address: payload.address?.trim() || undefined,
            honeyVarieties: payload.honeyVarieties,
            certifications: payload.certifications,
            typicalCapacityTonsPerYear: payload.typicalCapacityTonsPerYear,
            leadStatus: payload.leadStatus,
            notes: payload.notes?.trim() || undefined,
            isApproved: payload.leadStatus === 'ACTIVE_PARTNER',
            isActive: true,
            createdBy: actor.userId,
          },
        ],
        { session }
      );

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'sourcing',
        action: 'CREATE_SUPPLIER_LEAD',
        entityType: 'SUPPLIER',
        entityId: supplier._id,
        entityRef: supplier.code,
        after: supplier.toObject(),
        reason: payload.reason,
        session,
      });
      return supplier.toObject();
    });
  }

  async updateSupplierLeadStatus(
    req: Request,
    supplierId: string,
    payload: UpdateSupplierLeadStatusInput
  ) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      const supplier = await SupplierModel.findById(supplierId).session(session);
      if (!supplier) throw AppError.notFound('Supplier lead', supplierId);
      const before = supplier.toObject();
      supplier.leadStatus = payload.leadStatus;
      supplier.isActive = payload.leadStatus !== 'ON_HOLD';
      supplier.isApproved = payload.leadStatus === 'ACTIVE_PARTNER';
      await supplier.save({ session });
      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'sourcing',
        action: 'UPDATE_SUPPLIER_LEAD_STATUS',
        entityType: 'SUPPLIER',
        entityId: supplier._id,
        entityRef: supplier.code,
        before,
        after: supplier.toObject(),
        reason: payload.reason,
        session,
      });
      return supplier.toObject();
    });
  }

  // ==========================================================================
  // 1. LIST SOURCINGS AND CONTRACTS WITH R9 PRICE MASKING
  // ==========================================================================
  async listSourcings(
    req: Request,
    filter: { status?: string; stage?: string } = {}
  ): Promise<unknown[]> {
    const showPrices = canRoleViewPrices(req.user?.roleName ?? '');
    const query: Record<string, unknown> = { isVoid: false };
    if (filter.status) query.status = filter.status;
    if (filter.stage) query.stage = filter.stage;

    const sourcings = await SourcingModel.find(query)
      .populate('supplierId', 'code name country')
      .populate('materialId', 'code name kind unit')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const sourcingIds = sourcings.map((s) => s._id);
    const [prices, contracts] = await Promise.all([
      showPrices
        ? PriceModel.find({
            sourcingId: { $in: sourcingIds },
            isVoid: false,
          })
            .sort({ effectiveDate: -1 })
            .lean()
        : Promise.resolve([]),
      ContractModel.find({
        sourcingId: { $in: sourcingIds },
        isVoid: false,
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    const priceBySourcing = new Map(prices.map((p) => [String(p.sourcingId), p]));
    const contractBySourcing = new Map(
      contracts.map((contract) => [String(contract.sourcingId), contract])
    );
    const commercialFields = [
      'unitPriceEurPerKg',
      'unitPricePerKg',
      'inputPriceEur',
      'transportCostEur',
      'transportEurPerKg',
      'landedUnitPriceEurPerKg',
      'totalOfferValueEur',
      'totalLandedValueEur',
      'agreedPriceEurPerKg',
    ];
    const maskCommercialFields = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      const { ...rest } = value as Record<string, unknown>;
      for (const field of commercialFields) delete rest[field];
      return rest;
    };

    return sourcings.map((sourcing) => {
      const contract = contractBySourcing.get(String(sourcing._id)) ?? null;
      const rawOffer = sourcing.offer;
      const rawExternalAnalysis = sourcing.externalAnalysis;
      return {
        ...sourcing,
        ...(showPrices
          ? {
              offer: rawOffer,
              externalAnalysis: rawExternalAnalysis,
              adminPrice: priceBySourcing.get(String(sourcing._id)) ?? null,
              contract,
            }
          : {
              offer: maskCommercialFields(rawOffer),
              externalAnalysis: maskCommercialFields(rawExternalAnalysis),
              contract: maskCommercialFields(contract),
            }),
      };
    });
  }

  async listShippedContracts(req: Request): Promise<unknown[]> {
    const showPrices = canRoleViewPrices(req.user?.roleName ?? '');
    const contracts = await ContractModel.find({
      status: 'SHIPPED',
      isVoid: false,
    })
      .populate('supplierId', 'code name country')
      .populate('materialId', 'code name kind unit')
      .sort({ shippedAt: -1, createdAt: -1 })
      .limit(200)
      .lean();
    if (showPrices) return contracts;

    return contracts.map((contract) => {
      const {
        unitPriceEurPerKg: _price,
        transportCostEur: _transport,
        transportEurPerKg: _transportPerKg,
        landedUnitPriceEurPerKg: _landed,
        totalOfferValueEur: _offerValue,
        totalLandedValueEur: _landedValue,
        ...publicContract
      } = contract;
      return publicContract;
    });
  }

  // ==========================================================================
  // 2. CREATE SOURCING (Stage 1: OFFER) + Optional Admin Price Record [R1, R9]
  // ==========================================================================
  async createSourcing(
    req: Request,
    payload: CreateSourcingInput
  ) {
    const actor = req.user!;
    const showPrices = canRoleViewPrices(actor.roleName);
    if (
      !showPrices &&
      (payload.inputPriceEur !== undefined ||
        payload.unitPriceEurPerKg !== undefined ||
        payload.transportCostEur !== undefined)
    ) {
      throw AppError.forbidden(
        'Only Admin and Management may record offer prices or transport costs.'
      );
    }

    const offeredInputWeight =
      payload.offeredInputWeight ?? payload.offeredKg!;
    const massInputUnit = payload.offeredInputWeight === undefined
      ? 'kg'
      : payload.massInputUnit;
    const offeredPackages =
      payload.offeredDrums ??
      Math.ceil((payload.offeredKg ?? offeredInputWeight) / 290);
    const metrics = normalizeSourcingOfferMetrics({
      massInputUnit,
      offeredInputWeight,
      offeredPackages,
      priceBasis: payload.priceBasis,
      inputPriceEur: payload.inputPriceEur ?? payload.unitPriceEurPerKg,
      transportCostEur: payload.transportCostEur,
    });

    return withTransaction(async (session) => {
      const [supplier, material] = await Promise.all([
        SupplierModel.findById(payload.supplierId).session(session),
        MaterialModel.findById(payload.materialId).session(session),
      ]);
      if (!supplier || !supplier.isActive) throw AppError.notFound('Active Supplier', payload.supplierId);
      if (!material || !material.isActive) throw AppError.notFound('Active Material', payload.materialId);
      if (material.unit !== 'kg') {
        throw AppError.badRequest(
          'SOURCING_UNIT_NOT_SUPPORTED',
          `Sourcing currently supports kg-priced materials only; ${material.name} is configured in ${material.unit}.`
        );
      }

      const sourcingNo = await this.nextSequence('SOURCING', 'SRC', session);
      const country = payload.country.toUpperCase().trim();
      const offeredAt = new Date();

      const [sourcing] = await SourcingModel.create(
        [
          {
            sourcingNo,
            supplierId: supplier._id,
            materialId: material._id,
            country,
            massInputUnit,
            offeredInputWeight,
            packageType: payload.packageType,
            offeredKg: metrics.offeredKg,
            offeredDrums: offeredPackages,
            stage: 'EXTERNAL_ANALYSIS',
            status: 'IN_PROGRESS',
            offer: {
              offerRef: payload.offerRef?.trim() || null,
              packageType: payload.packageType,
              massInputUnit,
              offeredInputWeight,
              offeredKg: metrics.offeredKg,
              offeredDrums: offeredPackages,
              unitWeightKg: metrics.unitWeightKg,
              priceBasis: payload.priceBasis,
              unitPriceEurPerKg: metrics.unitPriceEurPerKg,
              transportCostEur: roundEur(payload.transportCostEur ?? 0),
              transportEurPerKg: metrics.transportEurPerKg,
              landedUnitPriceEurPerKg: metrics.landedUnitPriceEurPerKg,
              totalOfferValueEur: metrics.totalOfferValueEur,
              totalLandedValueEur: metrics.totalLandedValueEur,
              receivedAt: offeredAt,
              notes: payload.offerNotes?.trim() || null,
            },
            gates: SOURCING_GATES.map((gate) => ({
              gate,
              decision: gate === 'PRICE_OFFER' ? 'APPROVED' : 'PENDING',
              decidedBy: gate === 'PRICE_OFFER' ? actor.userId : null,
              decidedAt: gate === 'PRICE_OFFER' ? offeredAt : null,
              reason: gate === 'PRICE_OFFER' ? payload.reason : null,
            })),
            createdBy: actor.userId,
          },
        ],
        { session }
      );

      if (metrics.unitPriceEurPerKg > 0 && showPrices) {
        await PriceModel.create(
          [
            {
              entityType: 'SOURCING',
              sourcingId: sourcing._id,
              supplierId: supplier._id,
              materialId: material._id,
              country,
              currency: 'EUR',
              unitPricePerKg: metrics.unitPriceEurPerKg,
              transportCostEur: roundEur(payload.transportCostEur ?? 0),
              transportEurPerKg: metrics.transportEurPerKg,
              landedUnitPriceEurPerKg: metrics.landedUnitPriceEurPerKg,
              totalOfferValueEur: metrics.totalOfferValueEur,
              totalLandedValueEur: metrics.totalLandedValueEur,
              effectiveDate: offeredAt,
              createdBy: actor.userId,
              reason: payload.reason,
            },
          ],
          { session }
        );
      }

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'sourcing',
        action: 'CREATE',
        entityType: 'SOURCING',
        entityId: sourcing._id,
        entityRef: sourcing.sourcingNo,
        after: {
          sourcingNo: sourcing.sourcingNo,
          supplierId: supplier._id,
          country,
          offeredKg: metrics.offeredKg,
          offeredPackages,
          packageType: payload.packageType,
          unitWeightKg: metrics.unitWeightKg,
        },
        reason: payload.reason,
        session,
      });

      return sourcing;
    });
  }

  // ==========================================================================
  // 3. EVALUATE PURCHASE GATE (OFFER > EXTERNAL_ANALYSIS > SAMPLE > INHOUSE_QSI)
  // ==========================================================================
  async evaluateGate(
    req: Request,
    sourcingId: string,
    payload: EvaluateSourcingGateInput
  ) {
    return withTransaction(async (session) => {
      const actor = req.user!; 

      // 1. Enforce gate-specific permission (e.g. EXTERNAL_ANALYSIS requires 'management:approve')
      const requiredPerm = SOURCING_GATE_PERMISSIONS[payload.gate];
      if (!hasPermission(actor.permissions, requiredPerm)) {
        throw AppError.forbidden(
          `Gate '${payload.gate}' requires permission '${requiredPerm}' (Role: ${actor.roleName})`
        );
      }

      const sourcing = await SourcingModel.findById(sourcingId).session(session);
      if (!sourcing || sourcing.isVoid) throw AppError.notFound('Sourcing', sourcingId);
      if (sourcing.status === 'REJECTED') {
        throw AppError.conflict('SOURCING_ALREADY_REJECTED', `Sourcing ${sourcing.sourcingNo} is already closed/rejected.`);
      }

      const before = sourcing.toObject();

      // 2. Verify sequential gate order (all prior gates must be APPROVED)
      const gateIdx = SOURCING_GATES.indexOf(payload.gate);
      const currentStage = sourcing.stage === 'OFFER' ? 'PRICE_OFFER' : sourcing.stage;
      if (currentStage !== payload.gate) {
        throw AppError.conflict(
          'SOURCING_GATE_OUT_OF_ORDER',
          `Sourcing ${sourcing.sourcingNo} is at ${sourcing.stage}; gate ${payload.gate} cannot be evaluated now.`
        );
      }
      for (let i = 0; i < gateIdx; i++) {
        const prevGateName = SOURCING_GATES[i];
        const prevGate = sourcing.gates.find((g) => g.gate === prevGateName);
        if (!prevGate || prevGate.decision !== 'APPROVED') {
          throw AppError.unprocessable(
            'GATE_ORDER_VIOLATION',
            `Cannot evaluate gate '${payload.gate}' before prior gate '${prevGateName}' is APPROVED.`
          );
        }
      }
      const gateRecord = sourcing.gates.find((g) => g.gate === payload.gate);
      if (!gateRecord || gateRecord.decision !== 'PENDING') {
        throw AppError.conflict(
          'SOURCING_GATE_ALREADY_DECIDED',
          `Gate ${payload.gate} has already been decided.`
        );
      }

      // 3. Gate-specific data capture & validation
      if (
        payload.gate === 'EXTERNAL_ANALYSIS' &&
        payload.decision === 'APPROVED' &&
        !payload.externalAnalysis
      ) {
        throw AppError.badRequest(
          'EXTERNAL_ANALYSIS_REQUIRED',
          'Record the location, price, market-demand, transport, and external-quality assessment before approval.'
        );
      }
      if (
        payload.gate === 'EXTERNAL_ANALYSIS' &&
        payload.decision === 'APPROVED' &&
        payload.externalAnalysis &&
        (!payload.externalAnalysis.locationAcceptable ||
          !payload.externalAnalysis.priceAcceptable ||
          !payload.externalAnalysis.qualityAcceptable)
      ) {
        throw AppError.badRequest(
          'EXTERNAL_ANALYSIS_FAILED',
          'A failed location, price, or quality factor cannot be approved.'
        );
      }
      if (payload.gate === 'EXTERNAL_ANALYSIS' && payload.externalAnalysis) {
        sourcing.externalAnalysis = {
          labName: payload.externalAnalysis.labName,
          reportNo: payload.externalAnalysis.reportNo,
          reportDate: new Date(payload.externalAnalysis.reportDate),
          locationAcceptable: payload.externalAnalysis.locationAcceptable,
          priceAcceptable: payload.externalAnalysis.priceAcceptable,
          marketDemandFit: payload.externalAnalysis.marketDemandFit,
          transportCostEur: payload.externalAnalysis.transportCostEur,
          qualityAcceptable: payload.externalAnalysis.qualityAcceptable,
          parametersSummary: payload.externalAnalysis.parametersSummary,
          checkedByManagementId: actor.userId,
          checkedAt: new Date(),
          managementNotes: payload.externalAnalysis.managementNotes,
        };
      }

      if (
        payload.gate === 'SAMPLE' &&
        payload.decision === 'APPROVED' &&
        !payload.sample
      ) {
        throw AppError.badRequest(
          'SAMPLE_DETAILS_REQUIRED',
          'Record sample routing and sample reference before approving the sample gate.'
        );
      }
      if (payload.gate === 'SAMPLE' && payload.sample) {
        sourcing.sample = {
          sampleCode: payload.sample.sampleCode,
          routingMode: payload.sample.routingMode,
          qsiTrackingRef: payload.sample.qsiTrackingRef,
          receivedAt: new Date(payload.sample.receivedAt),
          weightGrams: payload.sample.weightGrams ?? 500,
          notes: payload.sample.notes,
        };
      }

      if (payload.gate === 'INHOUSE_QSI') {
        if (payload.decision === 'APPROVED') {
          if (
            !payload.inhouseQsi?.inhouseSensoryPass ||
            !payload.inhouseQsi?.qsiPass ||
            !payload.inhouseQsi.qsiReportPublishedAt
          ) {
            throw AppError.unprocessable(
              'QA_MATCH_PASS_REQUIRED',
              'Approving INHOUSE_QSI requires a published QSI report and both QSI and in-house sensory passes.'
            );
          }
        }
        if (payload.inhouseQsi) {
          sourcing.inhouse = {
            sensoryPass: payload.inhouseQsi.inhouseSensoryPass,
            notes: payload.inhouseQsi.sensoryNotes,
            checkedBy: actor.userId,
            checkedAt: new Date(),
          };
          sourcing.qsi = {
            reportNo: payload.inhouseQsi.qsiReportNo,
            pass: payload.inhouseQsi.qsiPass,
            reportPublishedAt: payload.inhouseQsi.qsiReportPublishedAt
              ? new Date(payload.inhouseQsi.qsiReportPublishedAt)
              : null,
            moisturePct: payload.inhouseQsi.moisturePct,
            hmfMgKg: payload.inhouseQsi.hmfMgKg,
            diastaseDn: payload.inhouseQsi.diastaseDn,
            c4SugarPass: payload.inhouseQsi.c4SugarPass,
            nmrPass: payload.inhouseQsi.nmrPass,
            attachmentId: payload.inhouseQsi.qsiAttachmentId
              ? new Types.ObjectId(payload.inhouseQsi.qsiAttachmentId)
              : null,
            verifiedBy: actor.userId,
            verifiedAt: new Date(),
          };
        }
      }

      // 4. Record gate decision
      gateRecord.decision = payload.decision;
      gateRecord.decidedBy = actor.userId;
      gateRecord.decidedAt = new Date();
      gateRecord.reason = payload.reason;

      // 5. Advance stage or close on rejection
      if (payload.decision === 'REJECTED') {
        sourcing.status = 'REJECTED';
        sourcing.stage = payload.gate;
      } else {
        const nextGate = SOURCING_GATES[gateIdx + 1];
        if (nextGate) {
          sourcing.stage = nextGate;
          sourcing.status = 'IN_PROGRESS';
        } else {
          // All 4 gates APPROVED -> Sourcing PASSED
          sourcing.stage = 'PASSED';
          sourcing.status = 'PASSED';
        }
      }

      await sourcing.save({ session });

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'sourcing',
        action: payload.decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
        entityType: 'SOURCING',
        entityId: sourcing._id,
        entityRef: `${sourcing.sourcingNo}:${payload.gate}`,
        before,
        after: sourcing.toObject(),
        reason: payload.reason,
        session,
      });

      return sourcing;
    });
  }

  // ==========================================================================
  // 4. ISSUE CONTRACT & MARK SHIPPED (Only from PASSED Sourcing) [R1, R9]
  // ==========================================================================
  async createContractFromSourcing(
    req: Request,
    sourcingId: string,
    payload: CreateContractFromSourcingInput
  ) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      const showPrices = canRoleViewPrices(actor.roleName);
      const sourcing = await SourcingModel.findById(sourcingId).session(session);
      if (!sourcing || sourcing.isVoid) throw AppError.notFound('Sourcing', sourcingId);

      if (sourcing.status !== 'PASSED') {
        throw AppError.unprocessable(
          'SOURCING_NOT_PASSED',
          `Contract can only be created when Sourcing is PASSED (current status: ${sourcing.status}).`
        );
      }

      const existingContract = await ContractModel.findOne({
        sourcingId: sourcing._id,
        isVoid: false,
      }).session(session);
      if (existingContract) {
        throw AppError.conflict(
          'CONTRACT_EXISTS',
          `Sourcing ${sourcing.sourcingNo} already has active Contract ${existingContract.contractNo}.`
        );
      }

      const contractNo = await this.nextSequence('CONTRACT', 'CT', session);
      const offer =
        sourcing.offer && typeof sourcing.offer === 'object'
          ? sourcing.offer
          : {};
      const offeredData = offer as Record<string, unknown>;
      const unitPriceEurPerKg =
        typeof offeredData.unitPriceEurPerKg === 'number'
          ? offeredData.unitPriceEurPerKg
          : undefined;
      const transportCostEur =
        typeof offeredData.transportCostEur === 'number'
          ? offeredData.transportCostEur
          : undefined;
      const transportEurPerKg =
        typeof offeredData.transportEurPerKg === 'number'
          ? offeredData.transportEurPerKg
          : undefined;
      const landedUnitPriceEurPerKg =
        typeof offeredData.landedUnitPriceEurPerKg === 'number'
          ? offeredData.landedUnitPriceEurPerKg
          : unitPriceEurPerKg;
      const totalOfferValueEur =
        typeof offeredData.totalOfferValueEur === 'number'
          ? offeredData.totalOfferValueEur
          : undefined;
      const totalLandedValueEur =
        typeof offeredData.totalLandedValueEur === 'number'
          ? offeredData.totalLandedValueEur
          : undefined;
      const contractedKg = sourcing.offeredKg;
      const packageCount = sourcing.offeredDrums;
      const unitWeightKg =
        typeof offeredData.unitWeightKg === 'number'
          ? offeredData.unitWeightKg
          : roundKg(contractedKg / packageCount);

      const [contract] = await ContractModel.create(
        [
          {
            contractNo,
            sourcingId: sourcing._id,
            supplierId: sourcing.supplierId,
            materialId: sourcing.materialId,
            country: sourcing.country,
            contractedKg,
            contractedDrums: packageCount,
            packageType: sourcing.packageType ?? 'DRUM',
            unitWeightKg,
            unitPriceEurPerKg,
            transportCostEur,
            transportEurPerKg,
            landedUnitPriceEurPerKg,
            totalOfferValueEur,
            totalLandedValueEur,
            deliveryTerms: payload.deliveryTerms?.trim() || 'DAP Hennigsdorf',
            expectedArrivalDate: payload.expectedArrivalDate ?? null,
            status: 'SIGNED',
            createdBy: actor.userId,
          },
        ],
        { session }
      );

      sourcing.stage = 'CONTRACTED';
      sourcing.status = 'CONTRACTED';
      await sourcing.save({ session });

      const supplier = await SupplierModel.findById(sourcing.supplierId).session(session);
      if (!supplier) {
        throw AppError.notFound('Supplier', String(sourcing.supplierId));
      }
      if (supplier.leadStatus === 'LEAD') {
        const supplierBefore = supplier.toObject();
        supplier.leadStatus = 'ACTIVE_PARTNER';
        supplier.isApproved = true;
        await supplier.save({ session });
        await recordAudit({
          req,
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'sourcing',
          action: 'ACTIVATE_SUPPLIER_PARTNER',
          entityType: 'SUPPLIER',
          entityId: supplier._id,
          entityRef: supplier.code,
          before: supplierBefore,
          after: supplier.toObject(),
          reason: payload.reason,
          session,
        });
      }

      if (unitPriceEurPerKg !== undefined) {
        await PriceModel.create(
          [
            {
              entityType: 'CONTRACT',
              sourcingId: sourcing._id,
              contractId: contract._id,
              supplierId: sourcing.supplierId,
              materialId: sourcing.materialId,
              country: sourcing.country,
              currency: 'EUR',
              unitPricePerKg: unitPriceEurPerKg,
              transportCostEur,
              transportEurPerKg,
              landedUnitPriceEurPerKg,
              totalOfferValueEur,
              totalLandedValueEur,
              effectiveDate: new Date(),
              createdBy: actor.userId,
              reason: payload.reason,
            },
          ],
          { session }
        );
      }

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'sourcing',
        action: 'CREATE',
        entityType: 'CONTRACT',
        entityId: contract._id,
        entityRef: contract.contractNo,
        after: contract.toObject(),
        reason: payload.reason,
        session,
      });

      if (showPrices) return contract.toObject();
      const contractData = contract.toObject();
      delete (contractData as Partial<typeof contractData>).unitPriceEurPerKg;
      delete (contractData as Partial<typeof contractData>).transportCostEur;
      delete (contractData as Partial<typeof contractData>).transportEurPerKg;
      delete (contractData as Partial<typeof contractData>).landedUnitPriceEurPerKg;
      delete (contractData as Partial<typeof contractData>).totalOfferValueEur;
      delete (contractData as Partial<typeof contractData>).totalLandedValueEur;
      return contractData;
    });
  }

  async markContractShipped(
    req: Request,
    contractId: string,
    payload: { shippingRef?: string; shippedAt?: string; reason: string }
  ) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      const showPrices = canRoleViewPrices(actor.roleName);
      const contract = await ContractModel.findById(contractId).session(session);
      if (!contract || contract.isVoid) throw AppError.notFound('Contract', contractId);
      if (contract.status !== 'SIGNED') {
        throw AppError.conflict(
          'CONTRACT_NOT_SHIPPABLE',
          `Contract ${contract.contractNo} cannot be marked shipped from status ${contract.status}.`
        );
      }

      const before = contract.toObject();
      contract.status = 'SHIPPED';
      contract.shippedAt = payload.shippedAt ? new Date(payload.shippedAt) : new Date();
      if (payload.shippingRef) contract.shippingRef = payload.shippingRef.trim();
      await contract.save({ session });

      const sourcing = await SourcingModel.findByIdAndUpdate(
        contract.sourcingId,
        { $set: { stage: 'SHIPPED', status: 'SHIPPED' } },
        { session }
      );
      if (!sourcing) {
        throw AppError.notFound('Sourcing record', String(contract.sourcingId));
      }

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'sourcing',
        action: 'STATE_CHANGE',
        entityType: 'CONTRACT',
        entityId: contract._id,
        entityRef: contract.contractNo,
        before,
        after: contract.toObject(),
        reason: payload.reason,
        session,
      });

      if (showPrices) return contract.toObject();
      const contractData = contract.toObject();
      delete (contractData as Partial<typeof contractData>).unitPriceEurPerKg;
      delete (contractData as Partial<typeof contractData>).transportCostEur;
      delete (contractData as Partial<typeof contractData>).transportEurPerKg;
      delete (contractData as Partial<typeof contractData>).landedUnitPriceEurPerKg;
      delete (contractData as Partial<typeof contractData>).totalOfferValueEur;
      delete (contractData as Partial<typeof contractData>).totalLandedValueEur;
      return contractData;
    });
  }

  // ==========================================================================
  // 5. ADMIN-ONLY PRICES ENDPOINTS [R9]
  // ==========================================================================
  async listAdminPrices(req: Request) {
    if (!canRoleViewPrices(req.user?.roleName ?? '')) {
      throw AppError.forbidden(
        'Commercial sourcing data is restricted to Admin and Management.'
      );
    }
    return PriceModel.find({ isVoid: false })
      .populate('supplierId', 'code name country')
      .populate('materialId', 'code name kind')
      .populate('sourcingId', 'sourcingNo status')
      .populate('contractId', 'contractNo status')
      .sort({ effectiveDate: -1 })
      .lean();
  }

  async upsertAdminPrice(
    req: Request,
    payload: {
      sourcingId?: string;
      contractId?: string;
      incomingLotId?: string;
      supplierId: string;
      materialId: string;
      country: string;
      unitPricePerKg: number;
      reason: string;
    }
  ) {
    if (!canRoleViewPrices(req.user?.roleName ?? '')) {
      throw AppError.forbidden(
        'Only Admin and Management may record commercial sourcing prices.'
      );
    }
    return withTransaction(async (session) => {
      const actor = req.user!;
      const [price] = await PriceModel.create(
        [
          {
            entityType: payload.incomingLotId
              ? 'INCOMING_LOT'
              : payload.contractId
              ? 'CONTRACT'
              : 'SOURCING',
            sourcingId: payload.sourcingId ? new Types.ObjectId(payload.sourcingId) : null,
            contractId: payload.contractId ? new Types.ObjectId(payload.contractId) : null,
            incomingLotId: payload.incomingLotId ? new Types.ObjectId(payload.incomingLotId) : null,
            supplierId: new Types.ObjectId(payload.supplierId),
            materialId: new Types.ObjectId(payload.materialId),
            country: payload.country.toUpperCase().trim(),
            currency: 'EUR',
            unitPricePerKg: payload.unitPricePerKg,
            effectiveDate: new Date(),
            createdBy: actor.userId,
            reason: payload.reason,
          },
        ],
        { session }
      );

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'prices',
        action: 'CREATE',
        entityType: 'PRICE',
        entityId: price._id,
        after: price.toObject(),
        reason: payload.reason,
        session,
      });

      return price;
    });
  }
}

export const sourcingService = new SourcingService();