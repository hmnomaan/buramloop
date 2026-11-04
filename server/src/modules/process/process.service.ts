// server/src/modules/process/process.service.ts
import { Types } from 'mongoose';
import { withTransaction } from '../../config/db';
import { AppError } from '../../common/errors';
import { recordAudit } from '../../common/audit.helper';
import { deriveReworkOriginComposition } from '../../../../shared/src/schemas/origin-blend';
import {
  BatchModel,
  ProcessStepModel,
  ReworkStockModel,
  DrumModel,
  StockPackageModel,
  StockMovementModel,
  CabinetModel,
  TankModel,
  FillLineModel,
  CounterModel,
  NotificationModel,
  MaterialModel,
} from '../../models';
import { IOriginSlice } from '../../models/stock.model';

export const SEVEN_STAGE_SEQUENCE = [
  'RESERVED',
  'WARMING_IN',
  'WARMING_OUT',
  'FILTERING',
  'BLENDING',
  'RESTING_TANK',
  'FILLING',
  'COMPLETED',
] as const;

export type SevenStageState = (typeof SEVEN_STAGE_SEQUENCE)[number];

export type CoreProcessStage = 'WARMING' | 'FILTERING' | 'BLENDING' | 'FILLING';

export interface RecordProcessStepInput {
  batchId: string;
  stage: CoreProcessStage;
  sevenStageTarget: SevenStageState;
  inKg: number;
  outKg: number;
  lossKg: number;
  reworkOutKg: number;
  tempC: number;
  personInChargeName: string;
  tankCode?: string;     // e.g. 'TANK-01' | 'TANK-02'
  fillLineCode?: string; // e.g. 'QUIEL_PET' | 'CARLO_JAR' | 'HAND'
  notes?: string;
  attachmentIds?: string[];
}

async function nextSequenceCode(prefix: string, key: string, session: any): Promise<string> {
  const yearShort = new Date().getFullYear().toString().slice(-2);
  const counterKey = `${key}_${yearShort}`;
  const doc = await CounterModel.findOneAndUpdate(
    { key: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  return `${prefix}-${yearShort}-${String(doc.seq).padStart(4, '0')}`;
}

export class ProcessService {
  /**
   * Lists all active and completed batches with their 7-stage process steps and generated rework stocks.
   */
  static async listProcesses() {
    const batches = await BatchModel.find({
      isVoid: false,
      status: { $in: ['RESERVED', 'WARMING', 'FILTERING', 'BLENDING', 'FILLING', 'DONE'] },
    })
      .sort({ updatedAt: -1 })
      .lean();

    const batchIds = batches.map((b: any) => b._id);
    const [steps, reworks] = await Promise.all([
      ProcessStepModel.find({ batchId: { $in: batchIds }, isVoid: false })
        .sort({ stepSequence: 1 })
        .lean(),
      ReworkStockModel.find({ sourceBatchId: { $in: batchIds }, status: { $ne: 'VOID' } })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return batches.map((batch: any) => {
      const batchSteps = steps
        .filter((s: any) => String(s.batchId) === String(batch._id))
        .map((step: any) => ({
          ...step,
          stage:
            step.stepType === 'FILTRATION'
              ? 'FILTERING'
              : step.stepType === 'RESTING_TANK'
                ? 'BLENDING'
                : step.stepType.startsWith('WARMING_')
                  ? 'WARMING'
                  : step.stepType,
          tankCode: step.tankCode,
          fillLineCode: step.fillLine,
        }));
      const stageByStatus: Record<string, SevenStageState> = {
        RESERVED: 'RESERVED',
        WARMING: 'WARMING_IN',
        FILTERING: 'FILTERING',
        BLENDING: 'BLENDING',
        FILLING: 'FILLING',
        DONE: 'COMPLETED',
      };
      return {
        ...batch,
        currentStage: batch.currentStage || stageByStatus[batch.status] || 'RESERVED',
        actualOutKg: batch.actualOutKg ?? batch.totalFilledKg,
        steps: batchSteps,
        reworkGenerated: reworks.filter((r: any) => String(r.sourceBatchId) === String(batch._id)),
        reworkStocks: reworks.filter((r: any) => String(r.sourceBatchId) === String(batch._id)),
      };
    });
  }

  /**
   * Executes a process stage transition inside an ACID transaction:
   * 1. Verifies valid 7-stage progression and batch = processNo invariant (R7).
   * 2. Validates mass conservation: inKg = outKg + lossKg + reworkOutKg (tolerance <= 0.001 kg).
   * 3. Validates cumulative mass continuity against the previous completed stage output.
   * 4. If reworkOutKg > 0, auto-generates a ReworkStock (RW-YY-NNNN) + serialized Drum with inherited originComposition[].
   * 5. Releases warm cabinet slots upon WARMING_OUT / FILTERING entry and updates drum statuses to Consumed on FILLING completion.
   */
  static async executeStage(
    input: RecordProcessStepInput,
    actorId: string,
    actorRole: string,
    reason: string
  ) {
    if (!Types.ObjectId.isValid(input.batchId)) {
      throw new AppError(422, 'BATCH_ID_INVALID', 'batchId must be a valid MongoDB ObjectId.');
    }
    // 1. Strict Mass-Balance verification: inKg = outKg + lossKg + reworkOutKg
    const stageWeights = [input.inKg, input.outKg, input.lossKg, input.reworkOutKg];
    if (
      stageWeights.some((weight) => !Number.isFinite(weight)) ||
      !Number.isFinite(input.tempC) ||
      input.tempC < 10 ||
      input.tempC > 85 ||
      typeof input.personInChargeName !== 'string' ||
      !input.personInChargeName.trim()
    ) {
      throw new AppError(
        422,
        'PROCESS_INPUT_INVALID',
        'Stage weights and temperature must be valid numbers, temperature must be 10–85°C, and personInChargeName is required.'
      );
    }
    const accountedKg = Number((input.outKg + input.lossKg + input.reworkOutKg).toFixed(3));
    const deltaKg = Math.abs(Number((input.inKg - accountedKg).toFixed(3)));

    if (input.inKg <= 0 || input.outKg < 0 || input.lossKg < 0 || input.reworkOutKg < 0) {
      throw new AppError(422, 'MASS_NEGATIVE_INVALID', 'Stage weights must be non-negative and inKg must be > 0.');
    }

    if (deltaKg > 0.001) {
      throw new AppError(
        422,
        'MASS_BALANCE_VIOLATION',
        `Mass balance violated on stage ${input.stage}: inKg (${input.inKg} kg) != outKg (${input.outKg} kg) + lossKg (${input.lossKg} kg) + reworkOutKg (${input.reworkOutKg} kg). Variance: ${deltaKg.toFixed(3)} kg.`
      );
    }

    return withTransaction(async (session) => {
      const batch: any = await BatchModel.findById(input.batchId).session(session);
      if (!batch) {
        throw new AppError(404, 'BATCH_NOT_FOUND', `Batch ${input.batchId} not found.`);
      }

      if (batch.status === 'VOID' || batch.status === 'DONE') {
        throw new AppError(
          409,
          'BATCH_IMMUTABLE_STATE',
          `Batch ${batch.processNo} is already in ${batch.status} state and cannot record new process stages.`
        );
      }

      // 2. Verify previous stage output continuity if a prior stage exists
      const priorSteps: any[] = await ProcessStepModel.find({
        batchId: batch._id,
        isVoid: false,
      })
        .sort({ stepSequence: -1 })
        .session(session);

      if (priorSteps.length > 0) {
        const lastStep = priorSteps[0];
        const continuityDelta = Math.abs(Number((input.inKg - lastStep.outKg).toFixed(3)));
        if (continuityDelta > 0.5) {
          throw new AppError(
            422,
            'STAGE_CONTINUITY_MISMATCH',
            `Stage ${input.stage} input (${input.inKg} kg) does not match previous stage (${lastStep.stepType}) output (${lastStep.outKg} kg).`
          );
        }
      }

      const stageTargets: Record<CoreProcessStage, SevenStageState[]> = {
        WARMING: ['WARMING_IN', 'WARMING_OUT'],
        FILTERING: ['FILTERING'],
        BLENDING: ['BLENDING', 'RESTING_TANK'],
        FILLING: ['FILLING', 'COMPLETED'],
      };
      const validTargets = stageTargets[input.stage];
      if (!validTargets || !validTargets.includes(input.sevenStageTarget)) {
        throw new AppError(
          422,
          'PROCESS_STAGE_TARGET_MISMATCH',
          `Stage ${input.stage} cannot advance the batch to ${input.sevenStageTarget}.`
        );
      }
      const currentStage = (batch.currentStage || 'RESERVED') as SevenStageState;
      if (
        !SEVEN_STAGE_SEQUENCE.includes(currentStage) ||
        SEVEN_STAGE_SEQUENCE.indexOf(input.sevenStageTarget) <=
          SEVEN_STAGE_SEQUENCE.indexOf(currentStage)
      ) {
        throw new AppError(
          409,
          'PROCESS_STAGE_ORDER_INVALID',
          `Batch ${batch.processNo} is at ${currentStage} and cannot advance to ${input.sevenStageTarget}.`
        );
      }

      // 3. Validate resting tank or fill line master references when required
      let tankDoc: any = null;
      if (input.tankCode && input.sevenStageTarget === 'RESTING_TANK') {
        tankDoc = await TankModel.findOne({ code: input.tankCode, isActive: true }).session(session);
        if (!tankDoc) {
          throw new AppError(404, 'TANK_NOT_FOUND', `Resting tank ${input.tankCode} not found or inactive.`);
        }
        if (tankDoc.currentBatchId && String(tankDoc.currentBatchId) !== String(batch._id)) {
          throw new AppError(409, 'TANK_IN_USE', `Resting tank ${input.tankCode} is already assigned to another batch.`);
        }
        if (input.outKg > tankDoc.capacityKg) {
          throw new AppError(
            422,
            'TANK_CAPACITY_EXCEEDED',
            `Resting tank ${input.tankCode} capacity is ${tankDoc.capacityKg} kg, below the ${input.outKg} kg output.`
          );
        }
      }

      let fillLineDoc: any = null;
      if (input.stage === 'FILLING') {
        if (!input.fillLineCode) {
          throw new AppError(422, 'FILL_LINE_REQUIRED', 'Filling stage requires a valid fillLineCode (QUIEL_PET, CARLO_JAR, or HAND).');
        }
        fillLineDoc = await FillLineModel.findOne({ code: input.fillLineCode, isActive: true }).session(session);
        if (!fillLineDoc) {
          throw new AppError(404, 'FILL_LINE_NOT_FOUND', `Filling line ${input.fillLineCode} not found or inactive.`);
        }
      }

      // 4. Create the ProcessStep document (batchNo = processNo per R7)
      const [stepDoc] = await ProcessStepModel.create(
        [
          {
            batchId: batch._id,
            processNo: batch.processNo,
            stepType:
              input.stage === 'FILTERING'
                ? 'FILTRATION'
                : input.stage === 'WARMING'
                  ? input.sevenStageTarget
                  : input.sevenStageTarget === 'RESTING_TANK'
                    ? 'RESTING_TANK'
                    : input.stage,
            stepSequence: priorSteps.length + 1,
            inKg: input.inKg,
            outKg: input.outKg,
            lossKg: input.lossKg,
            reworkOutKg: input.reworkOutKg,
            tempC: input.tempC,
            personInChargeId: new Types.ObjectId(actorId),
            personInChargeName: input.personInChargeName,
            tankId: tankDoc?._id,
            tankCode: tankDoc?.code,
            fillLine: fillLineDoc?.code,
            startedAt: new Date(),
            completedAt: new Date(),
            notes: input.notes,
            createdBy: new Types.ObjectId(actorId),
          },
        ],
        { session }
      );

      // Resolve batch materialId and fallback country safely for rework & consumption movements
      let effectiveMaterialId: Types.ObjectId | undefined =
        batch.baseMaterialId ?? batch.materialId;
      if (!effectiveMaterialId) {
        const sampleDrum = await DrumModel.findOne({ reservedBatchId: batch._id })
          .select('materialId country')
          .session(session)
          .lean();
        if (sampleDrum?.materialId) {
          effectiveMaterialId = sampleDrum.materialId as Types.ObjectId;
        } else {
          const sampleMaterial = await MaterialModel.findOne({
            kind: 'HONEY',
            unit: 'kg',
            isActive: true,
          })
            .select('_id')
            .session(session)
            .lean();
          effectiveMaterialId = sampleMaterial?._id as Types.ObjectId | undefined;
        }
        if (effectiveMaterialId) {
          batch.baseMaterialId = effectiveMaterialId;
        }
      }
      const fallbackCountry =
        (Array.isArray(batch.originComposition) && batch.originComposition[0]?.country) ||
        (Array.isArray(batch.allowedCountries) && batch.allowedCountries[0]) ||
        'DE';

      // 5. Automated Reworker Drum Generation (leftover -> new serialized drum with inherited origin[])
      let generatedRework: any = null;
      let generatedDrum: any = null;

      if (input.reworkOutKg > 0) {
        const reworkNo = await nextSequenceCode('RW', 'REWORK', session);
        const drumBarcode = `DR-${reworkNo}`;

        const parentSlices: IOriginSlice[] = Array.isArray(batch.originComposition)
          ? batch.originComposition
          : [];
        if (parentSlices.length === 0) {
          throw AppError.badRequest(
            'REWORK_ORIGIN_MISSING',
            `Cannot create rework for ${batch.processNo} without source-origin and price composition.`
          );
        }

        const derivedRework = deriveReworkOriginComposition(
          parentSlices.map((slice) => ({
            country: slice.country,
            incomingLotId: slice.incomingLotId.toHexString(),
            sourceDrumId: slice.sourceDrumId ? slice.sourceDrumId.toHexString() : null,
            sourcePackageId: slice.sourcePackageId
              ? slice.sourcePackageId.toHexString()
              : null,
            sourceReworkId: slice.sourceReworkId
              ? slice.sourceReworkId.toHexString()
              : null,
            kg: slice.kg,
            pct: slice.pct,
            unitPriceEurPerKg: Number(slice.unitPriceEurPerKg ?? 0),
            costValueEur: Number(slice.costValueEur ?? 0),
            costSharePct: Number(slice.costSharePct ?? slice.pct),
          })),
          input.reworkOutKg
        );

        const inheritedOrigins = derivedRework.reworkSlices.map((slice) => ({
          country: slice.country,
          incomingLotId: new Types.ObjectId(slice.incomingLotId),
          sourceDrumId: slice.sourceDrumId
            ? new Types.ObjectId(slice.sourceDrumId)
            : null,
          sourcePackageId: slice.sourcePackageId
            ? new Types.ObjectId(slice.sourcePackageId)
            : null,
          sourceReworkId: slice.sourceReworkId
            ? new Types.ObjectId(slice.sourceReworkId)
            : null,
          kg: slice.kg,
          pct: slice.pct,
          unitPriceEurPerKg: slice.unitPriceEurPerKg,
          costValueEur: slice.costValueEur,
          costSharePct: slice.costSharePct,
        }));

        const reworkCountry = inheritedOrigins[0]?.country ?? fallbackCountry;

        // Create serialized Rework Drum so it can be scanned/reserved into future batches
        const reworkDrumNo = Number(reworkNo.split('-').slice(-1)[0]);
        const [newDrum] = await DrumModel.create(
          [
            {
              drumCode: drumBarcode,
              barcode: drumBarcode,
              lotNoSnapshot: reworkNo,
              drumNo: reworkDrumNo,
              incomingLotId: null,
              materialId: effectiveMaterialId,
              country: reworkCountry,
              netKg: input.reworkOutKg,
              tareKg: 18.5,
              grossKg: Number((input.reworkOutKg + 18.5).toFixed(3)),
              status: 'Approved',
              location: 'Warehouse',
              isRework: true,
              sourceBatchId: batch._id,
              originComposition: inheritedOrigins,
              unitPriceEurPerKg:
                inheritedOrigins.length === 1
                  ? inheritedOrigins[0].unitPriceEurPerKg
                  : undefined,
            },
          ],
          { session }
        );
        generatedDrum = newDrum;

        const [reworkDoc] = await ReworkStockModel.create(
          [
            {
              reworkNo,
              sourceBatchId: batch._id,
              sourceProcessNo: batch.processNo,
              sourceStage: input.sevenStageTarget,
              sourceProcessStepId: stepDoc._id,
              materialId: effectiveMaterialId,
              totalKg: input.reworkOutKg,
              remainingKg: input.reworkOutKg,
              origin: inheritedOrigins,
              status: 'AVAILABLE',
              createdBy: new Types.ObjectId(actorId),
            },
          ],
          { session }
        );
        generatedRework = reworkDoc;
        stepDoc.generatedReworkId = reworkDoc._id;
        await stepDoc.save({ session });
        newDrum.sourceReworkId = reworkDoc._id;
        await newDrum.save({ session });

        // Write append-only positive stock movement for the newly created rework drum
        await StockMovementModel.create(
          [
            {
              drumId: newDrum._id,
              batchId: batch._id,
              materialId: effectiveMaterialId,
              country: reworkCountry,
              fromStatus: null,
              toStatus: 'Approved',
              movementType: 'REWORK_CREATED',
              signedKg: input.reworkOutKg,
              fromLocation: `Process:${batch.processNo}:${input.stage}`,
              toLocation: 'Warehouse',
              reason: `Auto-generated rework drum ${drumBarcode} (${input.reworkOutKg} kg) from ${batch.processNo} stage ${input.stage}: ${reason}`,
              performedBy: new Types.ObjectId(actorId),
            },
          ],
          { session }
        );
      }

      // 6. If transitioning into FILTERING from WARMING, release occupied warm cabinet slots
      if (input.sevenStageTarget === 'FILTERING') {
        const cabinets = await CabinetModel.find({
          'occupiedSlots.batchId': batch._id,
        }).session(session);
        for (const cabinet of cabinets) {
          cabinet.occupiedSlots = cabinet.occupiedSlots.filter(
            (slot) => String(slot.batchId) !== String(batch._id)
          );
          await cabinet.save({ session });
        }
      }

      const targetStatus =
        input.sevenStageTarget === 'COMPLETED'
          ? 'DONE'
          : input.sevenStageTarget === 'WARMING_IN' ||
              input.sevenStageTarget === 'WARMING_OUT'
            ? 'WARMING'
            : input.sevenStageTarget === 'FILTERING'
              ? 'FILTERING'
              : input.sevenStageTarget === 'BLENDING' ||
                  input.sevenStageTarget === 'RESTING_TANK'
                ? 'BLENDING'
                : 'FILLING';
      if (batch.status !== targetStatus) {
        try {
          batch.transitionTo(targetStatus, new Types.ObjectId(actorId), reason);
        } catch (error) {
          throw new AppError(
            409,
            'BATCH_PROCESS_TRANSITION_INVALID',
            error instanceof Error ? error.message : 'Batch status transition is invalid.'
          );
        }
      }
      batch.currentStage = input.sevenStageTarget;
      batch.totalInputKg = Number((batch.totalInputKg + input.inKg).toFixed(3));
      batch.totalFilledKg = Number((batch.totalFilledKg + input.outKg).toFixed(3));
      batch.totalLossKg = Number((batch.totalLossKg + input.lossKg).toFixed(3));
      batch.totalReworkOutKg = Number(
        (batch.totalReworkOutKg + input.reworkOutKg).toFixed(3)
      );
      if (tankDoc) {
        batch.restingTankId = tankDoc._id;
        tankDoc.currentBatchId = batch._id;
        await tankDoc.save({ session });
      }
      if (fillLineDoc) batch.fillLine = fillLineDoc.code;

      if (input.sevenStageTarget === 'COMPLETED') {
        batch.actualOutKg = input.outKg;
        batch.completedAt = new Date();

        const [reservedDrums, reservedPackages] = await Promise.all([
          DrumModel.find({
            reservedBatchId: batch._id,
            status: { $in: ['Reserved', 'Warming', 'InWarmRoom', 'InBatch'] },
          }).session(session),
          StockPackageModel.find({
            reservedBatchId: batch._id,
            status: { $in: ['Reserved', 'Warming', 'InWarmRoom', 'InBatch'] },
          }).session(session),
        ]);

        for (const drum of reservedDrums) {
          const fromStatus = drum.status;
          const fromLocation = drum.location || 'InBatch';
          drum.status = 'Consumed';
          drum.location = 'Consumed';
          await drum.save({ session });

          await StockMovementModel.create(
            [
              {
                drumId: drum._id,
                incomingLotId: drum.incomingLotId ?? null,
                batchId: batch._id,
                materialId: drum.materialId ?? effectiveMaterialId,
                country: drum.country ?? fallbackCountry,
                fromStatus,
                toStatus: 'Consumed',
                movementType: 'CONSUME_BATCH',
                signedKg: -Math.abs(Number(drum.netKg)),
                fromLocation,
                toLocation: 'Consumed',
                reason: `Consumed in completed batch/process ${batch.processNo}: ${reason}`,
                performedBy: new Types.ObjectId(actorId),
              },
            ],
            { session }
          );
        }

        for (const stockPackage of reservedPackages) {
          const fromStatus = stockPackage.status;
          const fromLocation = stockPackage.location || 'InBatch';
          stockPackage.status = 'Consumed';
          stockPackage.location = 'Consumed';
          await stockPackage.save({ session });

          await StockMovementModel.create(
            [
              {
                stockPackageId: stockPackage._id,
                incomingLotId: stockPackage.incomingLotId ?? null,
                batchId: batch._id,
                materialId: stockPackage.materialId ?? effectiveMaterialId,
                country: stockPackage.country ?? fallbackCountry,
                fromStatus,
                toStatus: 'Consumed',
                movementType: 'CONSUME_BATCH',
                signedKg: -Math.abs(Number(stockPackage.netKg)),
                fromLocation,
                toLocation: 'Consumed',
                reason: `Consumed in completed batch/process ${batch.processNo}: ${reason}`,
                performedBy: new Types.ObjectId(actorId),
              },
            ],
            { session }
          );
        }
      }
      if (
        (input.sevenStageTarget === 'FILLING' ||
          input.sevenStageTarget === 'COMPLETED') &&
        batch.restingTankId
      ) {
        await TankModel.updateOne(
          { _id: batch.restingTankId, currentBatchId: batch._id },
          { $set: { currentBatchId: null } },
          { session }
        );
        batch.restingTankId = null;
      }

      await batch.save({ session });

      // 8. Check for elevated process loss (> 2.5% of inKg) and emit deviation notification (R10)
      const lossRatio = input.lossKg / input.inKg;
      if (lossRatio > 0.025) {
        await NotificationModel.create(
          [
            {
              type: 'PROCESS_DEVIATION',
              severity: 'WARNING',
              title: `Elevated Process Loss on ${batch.processNo} (${input.stage})`,
              message: `Loss of ${input.lossKg.toFixed(1)} kg (${(lossRatio * 100).toFixed(2)}%) recorded during ${input.stage} by ${input.personInChargeName}.`,
              targetRoles: ['Admin', 'Management', 'QA', 'Production'],
              entityType: 'BATCH',
              entityId: batch._id,
            },
          ],
          { session }
        );
      }

      // 9. Append immutable AuditLog entry
      await recordAudit({
        actorId,
        actorRole,
        module: 'process',
        action: `PROCESS_STAGE_${input.stage}_COMPLETED`,
        entityType: 'PROCESS_STEP',
        entityId: stepDoc._id,
        entityRef: batch.processNo,
        reason,
        after: {
          processNo: batch.processNo,
          stage: input.stage,
          sevenStageTarget: batch.currentStage,
          inKg: input.inKg,
          outKg: input.outKg,
          lossKg: input.lossKg,
          reworkOutKg: input.reworkOutKg,
          tempC: input.tempC,
          reworkNo: generatedRework?.reworkNo ?? null,
          reworkDrumCode: generatedDrum?.drumCode ?? null,
        },
        session,
      });

      return {
        batch,
        step: {
          ...stepDoc.toObject(),
          stage: input.stage,
          tankCode: input.tankCode,
          fillLineCode: input.fillLineCode,
        },
        reworkStock: generatedRework,
        reworkDrum: generatedDrum,
      };
    });
  }
}