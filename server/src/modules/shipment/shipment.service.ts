import { Types } from 'mongoose';
import type { z } from 'zod';
import { withTransaction } from '../../config/db';
import { AppError } from '../../common/errors';
import { recordAudit } from '../../common/audit.helper';
import {
  CreateShipmentLotSchema,
  ShipmentLotStatus,
} from '../../../../shared/src/schemas/outbound';
import {
  ShipmentLotModel,
  ShipmentLotItemModel,
  BatchModel,
  CustomerModel,
  CounterModel,
} from '../../models';

export type CreateShipmentLotInput = z.infer<typeof CreateShipmentLotSchema>;

export class ShipmentService {
  static async listShipmentLots(filters: {
    status?: string;
    customerId?: string;
    batchId?: string;
  } = {}): Promise<unknown[]> {
    const query: Record<string, unknown> = {};
    if (typeof filters.status === 'string' && filters.status.trim()) {
      query.status = filters.status.trim();
    }
    if (typeof filters.customerId === 'string' && filters.customerId.trim()) {
      query.customerId = filters.customerId.trim();
    }
    if (typeof filters.batchId === 'string' && filters.batchId.trim()) {
      query.batchId = filters.batchId.trim();
    }
    const lots = await ShipmentLotModel.find(query)
      .populate('customerId', 'name code allowedCountries blockedCountries country')
      .populate('batchId', 'processNo status originComposition actualOutKg')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const lotIds = lots.map((lot) => lot._id);
    const items = await ShipmentLotItemModel.find({
      shipmentLotId: { $in: lotIds },
      isVoid: false,
    }).lean();

    return lots.map((lot) => ({
      ...lot,
      items: items.filter((item) => String(item.shipmentLotId) === String(lot._id)),
    }));
  }

  static async createShipmentLot(
    input: CreateShipmentLotInput,
    actorId: string,
    actorRole: string,
    reason: string
  ) {
    return withTransaction(async (session) => {
      const [batch, customer] = await Promise.all([
        BatchModel.findById(input.batchId).session(session),
        CustomerModel.findById(input.customerId).session(session),
      ]);

      if (!batch) {
        throw new AppError(404, 'BATCH_NOT_FOUND', `Batch ${input.batchId} not found.`);
      }
      if (batch.status !== 'DONE' || batch.isVoid) {
        throw new AppError(
          422,
          'BATCH_NOT_COMPLETED',
          `Batch ${batch.processNo} must be completed before shipment creation.`
        );
      }
      if (input.processNo !== batch.processNo) {
        throw new AppError(422, 'PROCESS_NO_MISMATCH', 'processNo must match the selected batch.');
      }
      if (!customer || !customer.isActive) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', `Customer ${input.customerId} not found or inactive.`);
      }

      const customerAllowed: string[] = customer.allowedCountries || [];
      const blocked: string[] = customer.blockedCountries || [];
      if (customerAllowed.length < 1 || customerAllowed.length > 3) {
        throw new AppError(
          422,
          'CUSTOMER_COUNTRY_RULE_INVALID',
          `Customer ${customer.name} must have between 1 and 3 allowed origin countries configured.`
        );
      }

      const isBatchDesignatedCustomer =
        batch.customerId && String(batch.customerId) === String(customer._id);
      const effectiveAllowed = isBatchDesignatedCustomer && Array.isArray(batch.allowedCountries) && batch.allowedCountries.length > 0
        ? [...new Set([...customerAllowed, ...batch.allowedCountries])].slice(0, 3)
        : customerAllowed;

      const batchOrigins = batch.originComposition || [];
      const forbiddenOrigins = batchOrigins
        .map((origin) => origin.country)
        .filter((country) => !effectiveAllowed.includes(country) || blocked.includes(country));
      if (!batchOrigins.length || forbiddenOrigins.length) {
        throw new AppError(
          422,
          'ORIGIN_COUNTRY_MISMATCH',
          !batchOrigins.length
            ? `Batch ${batch.processNo} has no origin composition.`
            : `Batch ${batch.processNo} contains prohibited origin(s) [${forbiddenOrigins.join(', ')}] for customer ${customer.name}.`
        );
      }

      const totalItemsKg = Number(
        input.items.reduce((sum, item) => sum + item.netKg, 0).toFixed(3)
      );

      const existingLots = await ShipmentLotModel.find({
        batchId: batch._id,
        status: { $ne: 'VOID' },
        isVoid: { $ne: true },
      })
        .select('orderedKg')
        .session(session)
        .lean();
      const alreadyAllocatedKg = Number(
        existingLots.reduce((sum, lot) => sum + Number(lot.orderedKg ?? 0), 0).toFixed(3)
      );
      const remainingBatchKg = Math.max(
        0,
        Number((Number(batch.actualOutKg ?? 0) - alreadyAllocatedKg).toFixed(3))
      );

      if (
        input.orderedKg > remainingBatchKg + 0.001 ||
        totalItemsKg > remainingBatchKg + 0.001
      ) {
        throw new AppError(
          422,
          'SHIPMENT_EXCEEDS_BATCH_OUTPUT',
          `Packaged quantity (${totalItemsKg} kg) exceeds remaining batch output (${remainingBatchKg} kg of ${batch.actualOutKg ?? 0} kg).`
        );
      }

      const yearShort = new Date().getFullYear().toString().slice(-2);
      const counter = await CounterModel.findOneAndUpdate(
        { key: `SHIPMENT_LOT_${yearShort}` },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, session }
      );
      const kgCode = String(Math.round(input.orderedKg)).padStart(5, '0');
      if (kgCode.length > 5) {
        throw new AppError(422, 'SHIPMENT_WEIGHT_CODE_INVALID', 'Ordered kg cannot exceed 99,999 kg per shipment lot.');
      }
      const generatedLotNo = `${input.destinationCountry}${yearShort}-${kgCode}-${batch.processNo}-${String(counter.seq).padStart(4, '0')}`;
      const shipmentLotNo = input.shipmentLotNo ?? generatedLotNo;

      const [shipmentLot] = await ShipmentLotModel.create(
        [
          {
            shipmentLotNo,
            isManualLotNo: input.isManualLotNo,
            batchId: batch._id,
            processNo: batch.processNo,
            customerId: customer._id,
            allowedCountriesSnapshot: effectiveAllowed,
            originComposition: batchOrigins,
            destinationCountry: input.destinationCountry,
            orderedKg: input.orderedKg,
            shippedKg: input.shippedKg,
            bestBeforeDate: input.bestBeforeDate,
            carrierName: input.carrierName,
            deliveryNoteNo: input.deliveryNoteNo,
            status: 'DRAFT',
            createdBy: new Types.ObjectId(actorId),
          },
        ],
        { session }
      );

      const itemDocs = await ShipmentLotItemModel.insertMany(
        input.items.map((item) => ({
          ...item,
          shipmentLotId: shipmentLot._id,
          shipmentLotNo,
          batchId: batch._id,
        })),
        { session }
      );

      await recordAudit({
        actorId,
        actorRole,
        module: 'shipment',
        action: 'SHIPMENT_LOT_CREATED',
        entityType: 'SHIPMENT_LOT',
        entityId: String(shipmentLot._id),
        entityRef: shipmentLotNo,
        reason,
        after: {
          shipmentLotNo,
          processNo: batch.processNo,
          customer: customer.name,
          allowedCountriesSnapshot: effectiveAllowed,
          orderedKg: input.orderedKg,
          packagedKg: totalItemsKg,
        },
        session,
      });

      return { shipmentLot, items: itemDocs };
    });
  }

  static async transitionStatus(
    shipmentLotId: string,
    targetStatus: ShipmentLotStatus,
    actorId: string,
    actorRole: string,
    reason: string
  ) {
    if (!Types.ObjectId.isValid(shipmentLotId)) {
      throw new AppError(422, 'SHIPMENT_LOT_ID_INVALID', 'Shipment lot ID must be a valid MongoDB ObjectId.');
    }
    return withTransaction(async (session) => {
      const lot = await ShipmentLotModel.findById(shipmentLotId).session(session);
      if (!lot) {
        throw new AppError(404, 'SHIPMENT_LOT_NOT_FOUND', `Shipment LOT ${shipmentLotId} not found.`);
      }
      const previousStatus = lot.status;
      try {
        lot.transitionTo(targetStatus, new Types.ObjectId(actorId), reason);
      } catch (error) {
        throw new AppError(
          422,
          'SHIPMENT_TRANSITION_INVALID',
          error instanceof Error ? error.message : 'Shipment status transition was rejected.'
        );
      }
      if (targetStatus === 'SHIPPED') {
        const items = await ShipmentLotItemModel.find({
          shipmentLotId: lot._id,
          isVoid: false,
        }).session(session);
        lot.shippedKg = Number(
          items.reduce((sum, item) => sum + item.netKg, 0).toFixed(3)
        );
        if (lot.shippedKg <= 0 || lot.shippedKg > lot.orderedKg * 1.1) {
          throw new AppError(
            422,
            'SHIPPED_QUANTITY_INVALID',
            `The packaged shipment quantity (${lot.shippedKg} kg) is invalid for order ${lot.orderedKg} kg.`
          );
        }
      }
      await lot.save({ session });

      await recordAudit({
        actorId,
        actorRole,
        module: 'shipment',
        action: `SHIPMENT_LOT_${targetStatus}`,
        entityType: 'SHIPMENT_LOT',
        entityId: String(lot._id),
        entityRef: lot.shipmentLotNo,
        reason,
        before: { status: previousStatus },
        after: { status: targetStatus, shipmentLotNo: lot.shipmentLotNo },
        session,
      });

      return lot;
    });
  }
}
