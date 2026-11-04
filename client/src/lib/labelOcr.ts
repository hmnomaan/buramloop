export interface ExtractedLabelFields {
  supplierLotReference: string;
  supplierName: string;
  exporter: string;
  originCountry: string;
  materialName: string;
  labelDate: string;
  packageCount: string;
  packageType: string;
  quantity: string;
  unit: string;
  barcode: string;
  drumNumber: string;
  tareKg: string;
  rawText: string;
}

export interface ScannedLabelData {
  fields: ExtractedLabelFields;
  image: File;
}

const EMPTY_FIELDS: ExtractedLabelFields = {
  supplierLotReference: '',
  supplierName: '',
  exporter: '',
  originCountry: '',
  materialName: '',
  labelDate: '',
  packageCount: '',
  packageType: '',
  quantity: '',
  unit: '',
  barcode: '',
  drumNumber: '',
  tareKg: '',
  rawText: '',
};

function valueAfterLabel(text: string, labels: string): string {
  const match = text.match(new RegExp(`(?:${labels})\\s*[:#-]?\\s*(.+)`, 'i'));
  return match?.[1]?.trim() ?? '';
}

export function extractLabelFields(
  rawText: string,
  barcode = ''
): ExtractedLabelFields {
  const text = rawText.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ');
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const joined = lines.join('\n');
  const quantityLine =
    joined.match(/(?:net(?:to)?\s*(?:weight|qty)?|quantity|amount)\s*[:#-]?\s*([\d.,]+)\s*(kg|kgs?|kilograms?|l|liters?|litres?|pcs?|pieces?)/i) ??
    joined.match(/\b([\d.,]+)\s*(kg|kgs?|kilograms?|l|liters?|litres?|pcs?|pieces?)\b/i);
  const packageMatch = joined.match(
    /\b(\d{1,5})\s*(drums?|barrels?|ibcs?|containers?|boxes|cartons?|bags|sacks|pails|pieces|pcs)\b/i
  );
  const countryValue = valueAfterLabel(joined, 'country\\s+of\\s+origin|origin|country');
  const countryIso = countryValue.match(/\b([A-Z]{2})\b/i)?.[1]?.toUpperCase() ?? '';
  const dateValue = valueAfterLabel(joined, 'production\\s+date|harvest\\s+date|packed\\s+on|date');
  const parsedDate =
    dateValue.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
    (dateValue.match(/\d+/g) ?? []).slice(0, 3).join('-');
  const tare = joined.match(/\btare(?:\s+weight)?\s*[:#-]?\s*([\d.,]+)\s*(?:kg|kgs?)?\b/i)?.[1] ?? '';

  return {
    ...EMPTY_FIELDS,
    supplierLotReference: valueAfterLabel(joined, 'supplier\\s+lot|lot\\s*(?:no|number|#)|batch\\s*(?:no|number|#)'),
    supplierName: valueAfterLabel(
      joined,
      'supplier(?!\\s+lot)|producer|manufacturer|packed\\s+by'
    ),
    exporter: valueAfterLabel(joined, 'exporter|exported\\s+by'),
    originCountry: countryIso,
    materialName: valueAfterLabel(joined, 'product|material|commodity|variety|description'),
    labelDate: parsedDate,
    packageCount: packageMatch?.[1] ?? '',
    packageType: packageMatch?.[2]?.toLowerCase() ?? '',
    quantity: quantityLine?.[1]?.replace(',', '.') ?? '',
    unit: quantityLine?.[2]?.toLowerCase() ?? '',
    barcode: barcode.trim().toUpperCase(),
    drumNumber: valueAfterLabel(joined, 'drum\\s*(?:no|number|#)|container\\s*(?:no|number|#)'),
    tareKg: tare.replace(',', '.'),
    rawText: text,
  };
}
