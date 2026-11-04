// server/src/models/index.ts
import mongoose from 'mongoose';
import { UserModel, RoleModel } from './access.model';

import { MaterialModel, QualityGradeModel } from './master.model';
import { AuditLogModel } from './auditLog.model';
import { CounterModel } from './counter.model';
import { getNextSequence } from './counter.model';
import { SupplierModel, SourcingModel, ContractModel, PriceModel } from './purchase.model';
import { AttachmentModel } from './attachment.model';
import { ExportLogModel } from './exportLog.model';
import {
  IncomingLotModel,
  DrumModel,
  StockPackageModel,
  StockMovementModel,
  LabReportModel,
} from './stock.model';
import {
  CabinetModel,
  TankModel,
  FillLineModel,
  BatchModel,
  BatchInputModel,
  ProcessStepModel,
  ReworkStockModel,
} from './production.model';
import {
  CustomerModel,
  ShipmentLotModel,
  ShipmentLotItemModel,
  CostReportModel,
  StockThresholdModel,
  NotificationModel,
} from './outbound.model';


export {
  UserModel,
  RoleModel,
  MaterialModel,
  QualityGradeModel,
  AuditLogModel,
  CounterModel,
  SupplierModel,
  SourcingModel,
  ContractModel,
  PriceModel,
  AttachmentModel,
  ExportLogModel,
  IncomingLotModel,
  DrumModel,
  StockPackageModel,
  StockMovementModel,
  LabReportModel,
  CabinetModel,
  TankModel,
  FillLineModel,
  BatchModel,
  BatchInputModel,
  ProcessStepModel,
  ReworkStockModel,
  CustomerModel,
  ShipmentLotModel,
  ShipmentLotItemModel,
  CostReportModel,
  StockThresholdModel,
  NotificationModel,
  getNextSequence,
};

export const ALL_MODELS: mongoose.Model<any>[] = [
  UserModel,
  RoleModel,
  MaterialModel,
  QualityGradeModel,
  AuditLogModel,
  CounterModel,
  SupplierModel,
  SourcingModel,
  ContractModel,
  PriceModel,
  AttachmentModel,
  ExportLogModel,
  IncomingLotModel,
  DrumModel,
  StockPackageModel,
  StockMovementModel,
  LabReportModel,
  CabinetModel,
  TankModel,
  FillLineModel,
  BatchModel,
  BatchInputModel,
  ProcessStepModel,
  ReworkStockModel,
  CustomerModel,
  ShipmentLotModel,
  ShipmentLotItemModel,
  CostReportModel,
  StockThresholdModel,
  NotificationModel,
];

/**
 * Ensures all compound unique indexes (e.g., incomingLotId+drumNo, attachment storage.path,
 * materialId+country threshold) are built in MongoDB.
 */
export async function syncAllModelIndexes(): Promise<void> {
  for (const model of ALL_MODELS) {
    await model.createIndexes();
  }
}