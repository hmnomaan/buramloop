// server/src/modules/export/export.service.ts
import crypto from 'crypto';
import { Types } from 'mongoose';
import { withSnapshotRead } from '../../config/db';
import { getStorageProvider } from '../../storage';
import {
  ExportLogModel,
  IncomingLotModel,
  DrumModel,
  BatchModel,
  ShipmentLotModel,
  AuditLogModel,
} from '../../models';
import { canRoleViewPrices } from '../../common/price-strip.helper';

export type ExportDatasetKey =
  | 'INCOMING_LOTS'
  | 'DRUM_STOCK'
  | 'BATCHES_PROCESS'
  | 'SHIPMENT_LOTS'
  | 'AUDIT_LOGS';

export type ExportFormat = 'CSV' | 'XLSX' | 'PDF' | 'DOCX' | 'PRINT_JSON';

interface ColumnDef {
  key: string;
  header: string;
  adminOnly?: boolean;
  inspectorHidden?: boolean;
}

const SHARED_EXPORT_COLUMNS: Record<ExportDatasetKey, ColumnDef[]> = {
  INCOMING_LOTS: [
    { key: 'lotNo', header: 'Lot Number' },
    { key: 'country', header: 'Origin Country' },
    { key: 'packageCount', header: 'Packages' },
    { key: 'unit', header: 'Unit' },
    { key: 'totalQuantity', header: 'Received Quantity' },
    { key: 'totalNetKg', header: 'Net Weight (kg)' },
    { key: 'status', header: 'QA Status' },
    { key: 'supplierName', header: 'Supplier', inspectorHidden: true },
    { key: 'pricePerKgEur', header: 'Purchase Price (EUR/kg)', adminOnly: true },
  ],
  DRUM_STOCK: [
    { key: 'drumCode', header: 'Drum Code' },
    { key: 'country', header: 'Origin' },
    { key: 'netKg', header: 'Net Weight (kg)' },
    { key: 'status', header: 'Status' },
    { key: 'location', header: 'Storage Location' },
    { key: 'isRework', header: 'Rework Drum' },
  ],
  BATCHES_PROCESS: [
    { key: 'processNo', header: 'Batch / Process No' },
    { key: 'plannedKg', header: 'Planned (kg)' },
    { key: 'approvedKg', header: 'Approved Input (kg)' },
    { key: 'actualOutKg', header: 'Actual Output (kg)' },
    { key: 'status', header: 'Stage Status' },
    { key: 'unitCostPerKgEur', header: 'Unit Cost (EUR/kg)', adminOnly: true },
  ],
  SHIPMENT_LOTS: [
    { key: 'shipmentLotNo', header: 'Shipment LOT No' },
    { key: 'processNo', header: 'Source Batch No' },
    { key: 'customerNameSnapshot', header: 'Customer', inspectorHidden: true },
    { key: 'destinationCountry', header: 'Destination' },
    { key: 'totalNetKg', header: 'Net Weight (kg)' },
    { key: 'totalPallets', header: 'Pallets' },
    { key: 'status', header: 'Release Status' },
  ],
  AUDIT_LOGS: [
    { key: 'createdAt', header: 'Timestamp' },
    { key: 'actorRole', header: 'Role' },
    { key: 'action', header: 'Action' },
    { key: 'entityType', header: 'Entity Type' },
    { key: 'entityRef', header: 'Reference' },
    { key: 'reason', header: 'Mandatory Audit Reason' },
  ],
};

export class ExportService {
  static async runSnapshotExport(params: {
    dataset: ExportDatasetKey;
    format: ExportFormat;
    saveToNextcloud?: boolean;
    actorId: string;
    actorRole: string;
  }) {
    const showPrices = canRoleViewPrices(params.actorRole);
    const isInspector = params.actorRole === 'Inspector' || params.actorRole === 'INSPECTOR';

    // 1. Filter columns by RBAC (strip adminOnly and inspectorHidden columns)
    const allowedColumns = (SHARED_EXPORT_COLUMNS[params.dataset] || []).filter((col) => {
      if (col.adminOnly && !showPrices) return false;
      if (col.inspectorHidden && isInspector) return false;
      return true;
    });

    // 2. Execute snapshot read across MongoDB replica set
    const rows = await withSnapshotRead(async (session) => {
      switch (params.dataset) {
        case 'INCOMING_LOTS': {
          const lots = await IncomingLotModel.find()
            .sort({ createdAt: -1 })
            .limit(250)
            .session(session)
            .lean();
          return lots.map((lot) => ({
            ...lot,
            packageCount: lot.packageCount ?? lot.drumsCount,
            totalQuantity: lot.totalQuantity ?? lot.totalNetKg,
            unit: lot.unit ?? 'kg',
          }));
        }
        case 'DRUM_STOCK':
          return DrumModel.find().sort({ createdAt: -1 }).limit(500).session(session).lean();
        case 'BATCHES_PROCESS':
          return BatchModel.find().sort({ createdAt: -1 }).limit(250).session(session).lean();
        case 'SHIPMENT_LOTS':
          return ShipmentLotModel.find().sort({ createdAt: -1 }).limit(250).session(session).lean();
        case 'AUDIT_LOGS':
          return AuditLogModel.find().sort({ createdAt: -1 }).limit(500).session(session).lean();
        default:
          return [];
      }
    });

    // 3. Project only permitted columns
    const sanitizedRows = (rows as Record<string, any>[]).map((row) => {
      const projected: Record<string, unknown> = {};
      for (const col of allowedColumns) {
        projected[col.key] = row[col.key] ?? '';
      }
      return projected;
    });

    // Build CSV/tabular payload
    const headerLine = allowedColumns.map((c) => `"${c.header}"`).join(',');
    const dataLines = sanitizedRows.map((r) =>
      allowedColumns
        .map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csvContent = [headerLine, ...dataLines].join('\n');
    const buffer = Buffer.from(csvContent, 'utf-8');
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const fileName = `EXPORT-${params.dataset}-${Date.now()}.${params.format.toLowerCase()}`;

    // 4. Optionally archive to Nextcloud /Exports/<YYYY-MM>/
    let storageMeta: any = undefined;
    if (params.saveToNextcloud) {
      const storage = getStorageProvider();
      const monthFolder = new Date().toISOString().slice(0, 7);
      const relPath = `Exports/${monthFolder}/${fileName}`;
      storageMeta = await storage.putObject(relPath, buffer, 'text/csv', sha256);
    }

    // 5. Write immutable ExportLog entry (R13, R14)
    const exportedAt = new Date();
    const exportLog = await ExportLogModel.create({
      module: params.dataset,
      format: params.format,
      entityIds: (rows as Array<{ _id?: Types.ObjectId }>)
        .flatMap((row) => row._id ? [row._id] : []),
      filters: {
        rowCount: sanitizedRows.length,
        columnsIncluded: allowedColumns.map((column) => column.key),
        adminFieldsStripped: !showPrices,
        sha256,
        nextcloudPath: storageMeta?.path ?? null,
        exportedAt,
      },
      fileName,
      createdBy: new Types.ObjectId(params.actorId),
    });

    return {
      exportId: exportLog._id,
      dataset: params.dataset,
      format: params.format,
      rowCount: sanitizedRows.length,
      columns: allowedColumns,
      rows: sanitizedRows,
      csvContent,
      nextcloudPath: storageMeta?.path ?? null,
      exportedAt, // timestamp of export
    };
  }

  static async listExportLogs() {
    return ExportLogModel.find().sort({ exportedAt: -1 }).limit(50).lean();
  }
}