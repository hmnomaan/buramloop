// // Append to shared/src/schemas/columns.ts
// import { ExportColumnDef } from './export';

// export const CABINET_EXPORT_COLUMNS: ExportColumnDef[] = [
//   { key: 'code', label: 'Cabinet Code', width: 14 },
//   { key: 'name', label: 'Cabinet Name', width: 22 },
//   { key: 'occupiedSlotsCount', label: 'Occupied Slots', width: 15 },
//   { key: 'capacityDrums', label: 'Max Slots', width: 12 },
//   { key: 'targetTempC', label: 'Target Temp (°C)', width: 16 },
//   { key: 'nextReadyAt', label: 'Next Ready At (24-48h)', width: 22 },
//   { key: 'isActive', label: 'Active', width: 10 },
// ];

// export const BATCH_EXPORT_COLUMNS: ExportColumnDef[] = [
//   { key: 'processNo', label: 'Batch / Process No', width: 18 },
//   { key: 'status', label: 'Status', width: 14 },
//   { key: 'allowedCountries', label: 'Allowed Countries', width: 18 },
//   { key: 'plannedKg', label: 'Planned (kg)', width: 14 },
//   { key: 'approvedKg', label: 'Approved w/ Buffer (kg)', width: 20 },
//   { key: 'totalInputKg', label: 'Total Input (kg)', width: 16 },
//   { key: 'totalFilledKg', label: 'Filled Output (kg)', width: 16 },
//   { key: 'totalLossKg', label: 'Process Loss (kg)', width: 16 },
//   { key: 'totalReworkOutKg', label: 'To Rework (kg)', width: 16 },
//   { key: 'restingTankCode', label: 'Resting Tank', width: 14 },
//   { key: 'fillLine', label: 'Filling Line', width: 15 },
//   { key: 'readyAt', label: 'Warm Ready At', width: 20 },
//   { key: 'createdAt', label: 'Created At', width: 20 },
// ];

// export const PROCESS_STEP_EXPORT_COLUMNS: ExportColumnDef[] = [
//   { key: 'processNo', label: 'Process No', width: 16 },
//   { key: 'stepType', label: 'Step', width: 16 },
//   { key: 'tempC', label: 'Temp (°C)', width: 12 },
//   { key: 'personInChargeName', label: 'Person In Charge', width: 22 },
//   { key: 'inKg', label: 'In (kg)', width: 14 },
//   { key: 'outKg', label: 'Out (kg)', width: 14 },
//   { key: 'lossKg', label: 'Loss (kg)', width: 14 },
//   { key: 'reworkOutKg', label: 'Rework (kg)', width: 14 },
//   { key: 'tankCode', label: 'Tank', width: 14 },
//   { key: 'fillLine', label: 'Fill Line', width: 14 },
//   { key: 'startedAt', label: 'Started At', width: 20 },
//   { key: 'completedAt', label: 'Completed At', width: 20 },
// ];

// export const REWORK_STOCK_EXPORT_COLUMNS: ExportColumnDef[] = [
//   { key: 'reworkNo', label: 'Rework No', width: 16 },
//   { key: 'sourceProcessNo', label: 'Source Batch No', width: 16 },
//   { key: 'status', label: 'Status', width: 14 },
//   { key: 'totalKg', label: 'Initial (kg)', width: 14 },
//   { key: 'remainingKg', label: 'Remaining (kg)', width: 14 },
//   { key: 'originSummary', label: 'Origin Breakdown (%)', width: 32 },
//   { key: 'createdAt', label: 'Created At', width: 20 },
// ];



// /// compare
// Append to shared/src/schemas/columns.ts
import { ExportColumnDef } from './export.ts';

export const CUSTOMER_EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: 'code', label: 'Customer Code', width: 16 },
  { key: 'name', label: 'Customer Name', width: 26 },
  { key: 'country', label: 'Country (ISO-2)', width: 14 },
  { key: 'allowedCountries', label: 'Allowed Honey Origins (1-3)', width: 24 },
  { key: 'blockedCountries', label: 'Blocked Origins (0%)', width: 20 },
  { key: 'allowReworkHoney', label: 'Rework Allowed', width: 14 },
  { key: 'maxReworkSharePct', label: 'Max Rework (%)', width: 14 },
  { key: 'isActive', label: 'Active', width: 10 },
];

export const SHIPMENT_LOT_EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: 'shipmentLotNo', label: 'Shipment LOT No', width: 26 },
  { key: 'processNo', label: 'Batch / Process No', width: 18 },
  { key: 'status', label: 'Status', width: 14 },
  { key: 'customerName', label: 'Customer', width: 24, inspectorHidden: true },
  { key: 'destinationCountry', label: 'Destination', width: 14 },
  { key: 'orderedKg', label: 'Ordered (kg)', width: 15 },
  { key: 'shippedKg', label: 'Shipped (kg)', width: 15 },
  { key: 'originSummary', label: 'Origin Composition (%)', width: 32 },
  { key: 'bestBeforeDate', label: 'Best Before', width: 16 },
  { key: 'releasedAt', label: 'Released At', width: 20 },
  { key: 'shippedAt', label: 'Shipped At', width: 20 },
];

export const COST_REPORT_EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: 'reportNo', label: 'Report No', width: 16, adminOnly: true },
  { key: 'processNo', label: 'Batch / Process No', width: 18, adminOnly: true },
  { key: 'shipmentLotNo', label: 'Shipment LOT', width: 24, adminOnly: true },
  { key: 'totalBatchKg', label: 'Total Batch (kg)', width: 16, adminOnly: true },
  { key: 'honeyCostEur', label: 'Raw Honey Cost (EUR)', width: 18, adminOnly: true },
  { key: 'flavourCostEur', label: 'Flavours Cost (EUR)', width: 18, adminOnly: true },
  { key: 'totalCostEur', label: 'Total Batch Cost (EUR)', width: 20, adminOnly: true },
  { key: 'costPerKgEur', label: 'Unit Cost (EUR/kg)', width: 18, adminOnly: true },
  { key: 'sellingPriceEurPerKg', label: 'Sell Price (EUR/kg)', width: 18, adminOnly: true },
  { key: 'totalRevenueEur', label: 'Total Revenue (EUR)', width: 20, adminOnly: true },
  { key: 'marginEur', label: 'Margin (EUR)', width: 16, adminOnly: true },
  { key: 'marginPct', label: 'Margin (%)', width: 14, adminOnly: true },
  { key: 'sentToManagementAt', label: 'Sent to Management', width: 20, adminOnly: true },
];

export const STOCK_THRESHOLD_EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: 'materialName', label: 'Material', width: 22 },
  { key: 'country', label: 'Origin Country', width: 14 },
  { key: 'minApprovedFreeKg', label: 'Min Free (kg)', width: 16 },
  { key: 'minApprovedFreeDrums', label: 'Min Free Drums (290kg)', width: 20 },
  { key: 'isActive', label: 'Active', width: 10 },
];

export const NOTIFICATION_EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: 'createdAt', label: 'Timestamp', width: 20 },
  { key: 'type', label: 'Alert Type', width: 24 },
  { key: 'severity', label: 'Severity', width: 12 },
  { key: 'title', label: 'Title', width: 28 },
  { key: 'message', label: 'Message', width: 45 },
];