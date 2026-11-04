// server/src/modules/cost/cost.service.ts
import crypto from 'crypto';
import { Types } from 'mongoose';
import { withTransaction } from '../../config/db';
import { AppError } from '../../common/errors';
import { recordAudit } from '../../common/audit.helper';
import { getStorageProvider } from '../../storage';
import { roundEur, roundKg } from '../../../../shared/src/schemas/common';
import {
  CostReportModel,
  PriceModel,
  BatchModel,
  CounterModel,
  AttachmentModel,
  IncomingLotModel,
  MaterialModel,
} from '../../models';

export interface GenerateCostReportInput {
  batchId: string;
  sellingPricePerKgEur: number;
  processingOverheadEur: number;
  packagingCostEur: number;
  managementRecipients: string[];
  notes?: string;
}

export function calculateOriginSliceCost(
  slice: { kg: number; unitPriceEurPerKg?: number; costValueEur?: number; valueEur?: number },
  fallbackUnitPriceEurPerKg: number
) {
  const qtyKg = roundKg(Number(slice.kg));
  const recordedPrice = Number(slice.unitPriceEurPerKg ?? 0);
  const unitPriceEurPerKg = roundEur(
    recordedPrice > 0 ? recordedPrice : fallbackUnitPriceEurPerKg
  );
  if (!Number.isFinite(unitPriceEurPerKg) || unitPriceEurPerKg <= 0) {
    throw new AppError(422, 'SOURCE_PRICE_MISSING', 'No recorded or active source price is available for this origin slice.');
  }
  const costValue = Number(slice.costValueEur ?? 0);
  const legacyValue = Number(slice.valueEur ?? 0);
  const recordedCost = costValue > 0 ? costValue : legacyValue;
  return {
    qtyKg,
    unitPriceEurPerKg,
    lineCostEur: roundEur(recordedCost > 0 ? recordedCost : qtyKg * unitPriceEurPerKg),
  };
}

export class CostService {
  /**
   * Lists all Admin Cost Reports and active Material Prices.
   * Never callable by non-Admin / non-Management roles (enforced at route + service level).
   */
  static async listCostReports(actorRole: string) {
    if (actorRole !== 'Admin' && actorRole !== 'ADMIN' && actorRole !== 'Management' && actorRole !== 'MANAGEMENT') {
      throw new AppError(403, 'FORBIDDEN_ADMIN_COSTS', 'Access to commercial prices and cost reports is restricted to Admin/Management.');
    }

    const [reports, prices] = await Promise.all([
      CostReportModel.find({ isVoid: false })
        .populate('batchId', 'processNo plannedKg approvedKg actualOutKg originComposition status')
        .sort({ createdAt: -1 })
        .lean(),
      PriceModel.find({ isVoid: false, effectiveDate: { $lte: new Date() } })
        .populate('materialId', 'code name kind')
        .populate('supplierId', 'code name country')
        .sort({ effectiveDate: -1 })
        .lean(),
    ]);

    return { reports, prices };
  }

  /**
   * Generates an immutable Batch Cost & Gross Margin Report (R9) and saves a copy
   * to the restricted Nextcloud folder BuramLoop/AdminCostReports/<reportNo>/ (R16).
   */
  static async generateCostReport(
    input: GenerateCostReportInput,
    actorId: string,
    actorRole: string,
    reason: string
  ) {
    if (actorRole !== 'Admin' && actorRole !== 'ADMIN') {
      throw new AppError(403, 'ADMIN_ONLY_OPERATION', 'Only Admin can generate or modify commercial cost reports.');
    }

    const storage = getStorageProvider();
    let uploadedRelativePath: string | null = null;

    try {
      return await withTransaction(async (session) => {
        const batch: any = await BatchModel.findById(input.batchId).session(session);
        if (!batch) {
          throw new AppError(404, 'BATCH_NOT_FOUND', `Batch ${input.batchId} not found.`);
        }

        const [baseMaterial, originLots, activePrices] = await Promise.all([
          MaterialModel.findById(batch.baseMaterialId).session(session).lean(),
          IncomingLotModel.find({
            _id: { $in: (batch.originComposition ?? []).map((slice: any) => slice.incomingLotId) },
          }).session(session).lean(),
          PriceModel.find({
            isVoid: false,
            effectiveDate: { $lte: new Date() },
          }).sort({ effectiveDate: -1 }).session(session).lean(),
        ]);
        if (!baseMaterial) {
          throw new AppError(404, 'BASE_MATERIAL_NOT_FOUND', `Material ${batch.baseMaterialId} not found.`);
        }

        const originSlices: any[] = batch.originComposition ?? [];
        const lotById = new Map(originLots.map((lot: any) => [String(lot._id), lot]));
        const priceFor = (materialId: unknown, country: string, incomingLotId?: unknown) => {
          const applicable = activePrices.filter(
            (price: any) =>
              String(price.materialId) === String(materialId) && price.country === country
          );
          const exactLotPrice = incomingLotId
            ? applicable.find(
                (price: any) => String(price.incomingLotId ?? '') === String(incomingLotId)
              )
            : undefined;
          const countryPrice = applicable.find((price: any) => !price.incomingLotId);
          const fallback = activePrices.find(
            (price: any) =>
              String(price.materialId) === String(materialId) &&
              !price.incomingLotId
          );
          return Number(
            exactLotPrice?.unitPricePerKg ??
              countryPrice?.unitPricePerKg ??
              fallback?.unitPricePerKg ??
              NaN
          );
        };

        const breakdownLines: Array<{
          inputKind: 'HONEY_DRUM' | 'REWORK' | 'FLAVOUR';
          materialId: Types.ObjectId;
          materialName: string;
          incomingLotId?: Types.ObjectId | null;
          lotNo?: string | null;
          country?: string | null;
          qtyKg: number;
          unitPriceEurPerKg: number;
          lineCostEur: number;
        }> = [];
        let honeyMaterialCostEur = 0;
        for (const slice of originSlices) {
          const lot = lotById.get(String(slice.incomingLotId)) as any;
          const slicePrice = Number(slice.unitPriceEurPerKg ?? 0);
          const lotPrice = Number(lot?.unitPriceEurPerKg ?? 0);
          const fallbackPrice =
            slicePrice > 0
              ? slicePrice
              : lotPrice > 0
                ? lotPrice
                : priceFor(batch.baseMaterialId, slice.country, slice.incomingLotId);
          if (!Number.isFinite(fallbackPrice) || fallbackPrice <= 0) {
            throw new AppError(
              422,
              'SOURCE_PRICE_MISSING',
              `No recorded or active source price is available for ${slice.country} honey lot ${lot?.lotNo ?? slice.incomingLotId}.`
            );
          }
          const { qtyKg, unitPriceEurPerKg, lineCostEur } =
            calculateOriginSliceCost(slice, fallbackPrice);
          honeyMaterialCostEur = roundEur(honeyMaterialCostEur + lineCostEur);
          breakdownLines.push({
            inputKind: slice.sourceReworkId ? 'REWORK' : 'HONEY_DRUM',
            materialId: batch.baseMaterialId,
            materialName: baseMaterial.name,
            incomingLotId: slice.incomingLotId,
            lotNo: lot?.lotNo ?? null,
            country: slice.country,
            qtyKg,
            unitPriceEurPerKg,
            lineCostEur,
          });
        }
        if (originSlices.length === 0) {
          throw new AppError(
            422,
            'BATCH_ORIGIN_MISSING',
            `Batch ${batch.processNo} has no origin slices to cost.`
          );
        }

        const flavours: any[] = batch.flavours || [];
        let flavourCostEur = 0;
        for (const flavour of flavours) {
          const qtyKg = roundKg(Number(flavour.consumedKg ?? 0));
          if (qtyKg <= 0) continue;
          const material = await MaterialModel.findById(flavour.materialId).session(session).lean();
          const lot = flavour.incomingLotId
            ? await IncomingLotModel.findById(flavour.incomingLotId).session(session).lean()
            : null;
          const unitPriceEurPerKg = Number(
            lot?.unitPriceEurPerKg ??
              priceFor(flavour.materialId, lot?.country ?? '', flavour.incomingLotId)
          );
          if (!material || !Number.isFinite(unitPriceEurPerKg) || unitPriceEurPerKg <= 0) {
            throw new AppError(
              422,
              'FLAVOUR_SOURCE_PRICE_MISSING',
              `No recorded source price is available for flavour material ${flavour.materialId}.`
            );
          }
          const lineCostEur = roundEur(qtyKg * unitPriceEurPerKg);
          flavourCostEur = roundEur(flavourCostEur + lineCostEur);
          breakdownLines.push({
            inputKind: 'FLAVOUR',
            materialId: flavour.materialId,
            materialName: material.name,
            incomingLotId: flavour.incomingLotId ?? null,
            lotNo: lot?.lotNo ?? null,
            country: lot?.country ?? null,
            qtyKg,
            unitPriceEurPerKg: roundEur(unitPriceEurPerKg),
            lineCostEur,
          });
        }

        const inputKg = roundKg(Number(batch.approvedKg || batch.plannedKg));
        const outputKg = roundKg(Number(batch.actualOutKg || batch.totalFilledKg || inputKg));

        const totalBatchCostEur = roundEur(
          honeyMaterialCostEur +
            flavourCostEur +
            Number(input.processingOverheadEur) +
            Number(input.packagingCostEur)
        );

        const unitCostPerKgEur = roundEur(totalBatchCostEur / Math.max(outputKg, 1));
        const totalRevenueEur = roundEur(outputKg * input.sellingPricePerKgEur);
        const grossMarginEur = roundEur(totalRevenueEur - totalBatchCostEur);
        const grossMarginPct =
          totalRevenueEur > 0
            ? roundEur((grossMarginEur / totalRevenueEur) * 100)
            : 0;
        const managementRecipientIds = input.managementRecipients.map(
          (recipientId) => new Types.ObjectId(recipientId)
        );

        const yearShort = new Date().getFullYear().toString().slice(-2);
        const counter = await CounterModel.findOneAndUpdate(
          { key: `COST_REPORT_${yearShort}` },
          { $inc: { seq: 1 } },
          { new: true, upsert: true, session }
        );
        const reportNo = `CR-${yearShort}-${String(counter.seq).padStart(4, '0')}`;

        // Archive report snapshot into Admin-only Nextcloud folder (Two-Phase Upload)
        const reportDocumentPayload = {
          reportNo,
          processNo: batch.processNo,
          generatedAt: new Date().toISOString(),
          classification: 'CONFIDENTIAL_ADMIN_MANAGEMENT_ONLY',
          metrics: {
            inputKg,
            outputKg,
            honeyMaterialCostEur,
            flavourCostEur,
            processingOverheadEur: input.processingOverheadEur,
            packagingCostEur: input.packagingCostEur,
            totalBatchCostEur,
            unitCostPerKgEur,
            sellingPriceEurPerKg: input.sellingPricePerKgEur,
            totalRevenueEur,
            grossMarginEur,
            grossMarginPct,
            breakdownLines,
          },
          managementRecipients: managementRecipientIds,
          auditReason: reason,
        };

        const buffer = Buffer.from(JSON.stringify(reportDocumentPayload, null, 2), 'utf-8');
        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        const relativePath = `AdminCostReports/${reportNo}/${reportNo}-${batch.processNo}.json`;

        const storageResult = await storage.putObject(
          relativePath,
          buffer,
          'application/json',
          sha256
        );
        uploadedRelativePath = storageResult.path;

        const reportId = new Types.ObjectId();
        const [attachmentDoc] = await AttachmentModel.create(
          [
            {
              entityType: 'COST_REPORT',
              entityId: reportId,
              entityCode: reportNo,
              docType: 'MANAGEMENT_COST_REPORT',
              originalName: `${reportNo}-${batch.processNo}.json`,
              mimeType: 'application/json',
              sizeBytes: storageResult.sizeBytes,
              sha256,
              adminOnly: true, // Blocks non-Admin download in Step 5e stream
              storage: {
                provider: storageResult.provider,
                path: storageResult.path,
                fileId: storageResult.fileId,
                etag: storageResult.etag,
              },
              uploadedBy: new Types.ObjectId(actorId),
              status: 'ACTIVE',
            },
          ],
          { session }
        );

        const [reportDoc] = await CostReportModel.create(
          [
            {
              _id: reportId,
              reportNo,
              batchId: batch._id,
              processNo: batch.processNo,
              currency: 'EUR',
              totalBatchKg: outputKg,
              honeyCostEur: honeyMaterialCostEur,
              flavourCostEur,
              processingOverheadEur: input.processingOverheadEur,
              packagingCostEur: input.packagingCostEur,
              totalCostEur: totalBatchCostEur,
              costPerKgEur: unitCostPerKgEur,
              sellingPriceEurPerKg: input.sellingPricePerKgEur,
              totalRevenueEur,
              marginEur: grossMarginEur,
              marginPct: grossMarginPct,
              breakdownLines,
              sentToManagement: managementRecipientIds.length > 0,
              sentToManagementAt: managementRecipientIds.length > 0 ? new Date() : null,
              managementRecipientIds,
              nextcloudAttachmentId: attachmentDoc._id,
              createdBy: new Types.ObjectId(actorId),
            },
          ],
          { session }
        );


        // Record immutable audit log for cost report generation
        await recordAudit({
          actorId,
          actorRole,
          module: 'COST',
          action: 'COST_REPORT_GENERATED',
          entityType: 'COST_REPORT',
          entityId: String(reportDoc._id),
          reason,
          after: {
            reportNo,
            processNo: batch.processNo,
            totalBatchCostEur,
            grossMarginPct,
            nextcloudPath: storageResult.path,
          },
          session,
        });

        return reportDoc;
      });
    } catch (err) {
      if (uploadedRelativePath) {
        await storage.deleteObject(uploadedRelativePath);
      }
      throw err;
    }
  }
}