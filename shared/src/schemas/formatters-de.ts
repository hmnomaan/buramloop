// shared/src/schemas/formatters-de.ts
export type InspectionLanguage = 'DE' | 'EN' | 'TR' | 'BN';

const deOneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const deTwoDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * DIN 1333 mass formatting: e.g. 6704 -> "6.704,0 kg"
 */
export function formatDinKg(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0,0 kg';
  }
  return `${deOneDecimal.format(Number(value))} kg`;
}

/**
 * DIN 1333 percentage formatting: e.g. 68.7 -> "68,7 %"
 */
export function formatDinPct(
  value: number | null | undefined,
  decimals: 1 | 2 = 1
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '0,0 %';
  }
  const formatted =
    decimals === 2
      ? deTwoDecimal.format(Number(value))
      : deOneDecimal.format(Number(value));
  return `${formatted} %`;
}

/**
 * DIN 1333 lab value formatting: e.g. 8.2 -> "8,2"
 */
export function formatDinMetric(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return deOneDecimal.format(Number(value));
}

/**
 * DIN 5008 date formatting (DD.MM.YYYY)
 */
export function formatDinDate(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return '—';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * DIN 5008 24-hour timestamp with MEZ/CET suffix: e.g. "28.10.2026 · 09:04 Uhr MEZ"
 */
export function formatDinDateTime(
  isoOrDate: string | Date | null | undefined,
  lang: InspectionLanguage = 'DE'
): string {
  if (!isoOrDate) return '—';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = formatDinDate(d);
  const timePart = d.toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (lang === 'DE') return `${datePart} · ${timePart} Uhr MEZ`;
  if (lang === 'TR') return `${datePart} · ${timePart} TSİ/CET`;
  if (lang === 'BN') return `${datePart} · ${timePart} CET`;
  return `${datePart} · ${timePart} CET`;
}

export interface TraceDictionary {
  assuranceTag: string;
  pageTitle: string;
  pageSubtitle: string;
  findChainTitle: string;
  findChainSub: string;
  traceButton: string;
  walkingChain: string;
  startTraceTitle: string;
  startTraceBody: string;
  tryRecordsLabel: string;
  viewChainBtn: string;
  viewCertBtn: string;
  holdActionBtn: string;
  staffViewBtn: string;
  inspectorViewBtn: string;
  whereItCameFromTitle: string;
  whereItCameFromSub: string;
  kpiBatch: string;
  kpiHoneyInBatch: string;
  kpiSourceCountries: string;
  kpiRework: string;
  col1SourceLots: string;
  col2Drums: string;
  col3Batch: string;
  col4Process: string;
  col5Rework: string;
  col6ShipmentLot: string;
  noReworkGenerated: string;
  nothingShippedYet: string;
  honeyUseTitle: string;
  honeyUseSub: string;
  movementHistoryTitle: string;
  certOriginTitle: string;
  certTimelineTitle: string;
  certSourceIntakesTitle: string;
  certDownloadPdf: string;
  r8ZeroForbiddenBanner: string;
  showAllMovements: string;
  reworkFromOrigin: string;
  sourceCountryCount: string;
  sourceCompanyHidden: string;
}

export const TRACE_MULTILANG_I18N: Record<InspectionLanguage, TraceDictionary> = {
  DE: {
    assuranceTag: 'QUALITÄTSSICHERUNG · IFS FOOD V8 & HONIGV',
    pageTitle: 'Rückverfolgbarkeits-Explorer',
    pageSubtitle:
      'Klicken Sie auf eine Eingangscharge, ein Fass, eine Produktionscharge oder ein Versandlos für die lückenlose Vorwärts- und Rückwärtsverfolgung inkl. Bestandsbuch.',
    findChainTitle: 'CHARGENKETTE SUCHEN',
    findChainSub: 'Fasscode, Eingangscharge, Produktionscharge, Prozess-Nr. oder Versandlos (LOT)',
    traceButton: 'Prüfen',
    walkingChain: 'Chargenkette wird über Snapshot-Transaktion geladen...',
    startTraceTitle: 'RÜCKVERFOLGUNG STARTEN',
    startTraceBody:
      'Geben Sie eine beliebige Referenznummer ein. Sie sehen Herkunft, Verbleib, prozentuale Länderanteile (HonigV), QSI-Laborwerte und jede Bestandsbuchung.',
    tryRecordsLabel: 'AKTUELLE CHARGEN ZUM TESTEN',
    viewChainBtn: '⛓️ 6-Stufen Chargenkette (Detail)',
    viewCertBtn: '📄 Ursprungszertifikat & Übersicht',
    holdActionBtn: '🚨 Charge sofort sperren (IFS Hold)',
    staffViewBtn: 'Interne Ansicht',
    inspectorViewBtn: 'Behördenansicht (Maskiert)',
    whereItCameFromTitle: 'HERKUNFT & VERBLEIB (EIN SCHRITT VOR, EIN SCHRITT ZURÜCK)',
    whereItCameFromSub:
      'Jede Karte entspricht einem unveränderlichen Datensatz — klicken Sie zur Filterung der Bestandsbewegungen',
    kpiBatch: 'PRODUKTIONSCHARGE',
    kpiHoneyInBatch: 'HONIGMENGE IN CHARGE',
    kpiSourceCountries: 'URSPRUNGSLÄNDER',
    kpiRework: 'REWORK-ANTEIL',
    col1SourceLots: '1 · EINGANGSCHARGEN',
    col2Drums: '2 · GEBINDE / FÄSSER',
    col3Batch: '3 · PRODUKTIONSCHARGE',
    col4Process: '4 · PROZESSSCHRITTE',
    col5Rework: '5 · REWORK-BESTAND',
    col6ShipmentLot: '6 · VERSANDLOS (LOT)',
    noReworkGenerated: 'Kein Rework entstanden',
    nothingShippedYet: 'Noch kein Versandlos freigegeben',
    honeyUseTitle: 'HONIGEINSATZ & REWORK NACH URSPRUNGSLAND',
    honeyUseSub: 'Prozentualer Anteil an der Charge nach Ursprungsland (HonigV § 3)',
    movementHistoryTitle: 'UNVERÄNDERLICHES BESTANDSBUCH (GOBD)',
    certOriginTitle: 'Botanische & Geografische Herkunft (HonigV)',
    certTimelineTitle: 'Produktions- & Prüfprotokoll (Meilensteine)',
    certSourceIntakesTitle: 'Verwendete Eingangschargen & QSI-Zertifikate',
    certDownloadPdf: '↓ Ursprungszertifikat (PDF / CSV)',
    r8ZeroForbiddenBanner:
      '100,0 % Konformität: Keine gesperrten Ursprungsländer enthalten (0,0 % Drittland-Sperrliste).',
    showAllMovements: 'Alle Bewegungen anzeigen',
    reworkFromOrigin: 'Rework aus dieser Herkunft',
    sourceCountryCount: 'Ursprungsländer',
    sourceCompanyHidden: 'Lieferantenfirmenname in dieser Behördenansicht maskiert.',
  },
  EN: {
    assuranceTag: 'ASSURANCE · IFS FOOD V8 & HONIGV STANDARD',
    pageTitle: 'Traceability explorer',
    pageSubtitle:
      'Click a source lot, drum, batch or shipment to follow the honey both ways — and read every stock movement behind that record.',
    findChainTitle: 'FIND A CHAIN',
    findChainSub: 'Drum code, lot number, batch, process or shipment LOT',
    traceButton: 'Trace',
    walkingChain: 'Walking the chain...',
    startTraceTitle: 'START A TRACE',
    startTraceBody:
      'Enter any reference from the honey chain. You will see where it came from, where it ended up, the share of each origin country and every movement recorded against it.',
    tryRecordsLabel: 'TRY ONE OF YOUR RECORDS',
    viewChainBtn: '⛓️ 6-Column Chain Explorer',
    viewCertBtn: '📄 Origin Certificate Preview',
    holdActionBtn: '🚨 Place Regulatory Hold (IFS)',
    staffViewBtn: 'Staff view',
    inspectorViewBtn: 'Inspector view (Masked)',
    whereItCameFromTitle: 'WHERE IT CAME FROM, WHERE IT WENT',
    whereItCameFromSub: 'Every card is a stored record — click it to open its movements',
    kpiBatch: 'BATCH',
    kpiHoneyInBatch: 'HONEY IN BATCH',
    kpiSourceCountries: 'SOURCE COUNTRIES',
    kpiRework: 'REWORK',
    col1SourceLots: '1 · SOURCE LOTS',
    col2Drums: '2 · DRUMS',
    col3Batch: '3 · BATCH',
    col4Process: '4 · PROCESS',
    col5Rework: '5 · REWORK',
    col6ShipmentLot: '6 · SHIPMENT LOT',
    noReworkGenerated: 'No rework generated',
    nothingShippedYet: 'Nothing shipped yet',
    honeyUseTitle: 'HONEY USE AND REWORK PER SOURCE',
    honeyUseSub: 'Share of the batch, by origin country',
    movementHistoryTitle: 'MOVEMENT HISTORY',
    certOriginTitle: 'Where the honey came from (Botanical Harvest Origin)',
    certTimelineTitle: 'Production timeline',
    certSourceIntakesTitle: 'Source intakes behind this LOT',
    certDownloadPdf: '↓ Origin certificate (PDF / CSV)',
    r8ZeroForbiddenBanner:
      '100.0% Compliant: None of this LOT contains blocked origins (0.0% China).',
    showAllMovements: 'Show all movements',
    reworkFromOrigin: 'Rework from this source',
    sourceCountryCount: 'source country(ies)',
    sourceCompanyHidden: 'Source company information is not displayed in this regulatory view.',
  },
  TR: {
    assuranceTag: 'KALİTE GÜVENCESİ · IFS FOOD V8 VE HONIGV STANDARDI',
    pageTitle: 'İzlenebilirlik Gezgini',
    pageSubtitle:
      'Balın her iki yöndeki akışını ve her stoğun hareket kaydını görmek için kaynak parti, varil, üretim partisi veya sevkiyat lotuna tıklayın.',
    findChainTitle: 'PARTİ ZİNCİRİNİ BUL',
    findChainSub: 'Varil kodu, parti numarası, üretim partisi, proses no veya sevkiyat LOT',
    traceButton: 'İzle',
    walkingChain: 'İzleme zinciri yükleniyor...',
    startTraceTitle: 'İZLEMEYİ BAŞLAT',
    startTraceBody:
      'Bal tedarik zincirinden herhangi bir referans girin. Menşei, varış noktasını, menşe ülke oranlarını, QSI laboratuvar değerlerini ve tüm stok hareketlerini göreceksiniz.',
    tryRecordsLabel: 'KAYITLARINIZDAN BİRİNİ DENEYİN',
    viewChainBtn: '⛓️ 6 Sütunlu Zincir Gezgini',
    viewCertBtn: '📄 Menşe Sertifikası Önizleme',
    holdActionBtn: '🚨 Partiyi Hemen Askıya Al (IFS)',
    staffViewBtn: 'Personel Görünümü',
    inspectorViewBtn: 'Denetçi Görünümü (Maskeli)',
    whereItCameFromTitle: 'NEREDEN GELDİ, NEREYE GİTTİ (BİR ADIM İLERİ, BİR ADIM GERİ)',
    whereItCameFromSub: 'Her kart kalıcı bir kayıttır — hareketleri filtrelemek için karta tıklayın',
    kpiBatch: 'ÜRETİM PARTİSİ',
    kpiHoneyInBatch: 'PARTİDEKİ BAL MİKTARI',
    kpiSourceCountries: 'MENŞE ÜLKELER',
    kpiRework: 'REWORK ORANI',
    col1SourceLots: '1 · KAYNAK LOTLAR',
    col2Drums: '2 · VARİLLER / KAPLAR',
    col3Batch: '3 · ÜRETİM PARTİSİ',
    col4Process: '4 · PROSES ADIMLARI',
    col5Rework: '5 · REWORK STOĞU',
    col6ShipmentLot: '6 · SEVKİYAT LOTU',
    noReworkGenerated: 'Rework oluşmadı',
    nothingShippedYet: 'Henüz sevkiyat yapılmadı',
    honeyUseTitle: 'MENŞE ÜLKEYE GÖRE BAL VE REWORK KULLANIMI',
    honeyUseSub: 'Menşe ülkeye göre partideki bal payı (HonigV § 3)',
    movementHistoryTitle: 'DEĞİŞTİRİLEMEZ HAREKET GEÇMİŞİ (GOBD)',
    certOriginTitle: 'Balın Botanik ve Coğrafi Menşei',
    certTimelineTitle: 'Üretim Zaman Çizelgesi (Aşamalar)',
    certSourceIntakesTitle: 'Bu LOT İçin Kullanılan Giriş Partileri ve QSI Raporları',
    certDownloadPdf: '↓ Menşe Sertifikası (PDF / CSV)',
    r8ZeroForbiddenBanner:
      '%100 Uygunluk: Bu LOT yasaklı menşe ülke içermez (%0,0 yasaklı liste).',
    showAllMovements: 'Tüm hareketleri göster',
    reworkFromOrigin: 'Bu menşeden rework',
    sourceCountryCount: 'menşe ülke',
    sourceCompanyHidden: 'Tedarikçi şirket bilgisi bu denetim görünümünde gizlenmiştir.',
  },
  BN: {
    assuranceTag: 'গুণমান নিশ্চিতকরণ · IFS ফুড v8 এবং হানি-ভি স্ট্যান্ডার্ড',
    pageTitle: 'ট্রেসেবিলিটি এক্সপ্লোরার',
    pageSubtitle:
      'মধুর দ্বি-মুখী প্রবাহ ও প্রতিটি স্টক মুভমেন্ট দেখতে উৎস লট, ড্রাম, ব্যাচ বা শিপমেন্ট লটে ক্লিক করুন।',
    findChainTitle: 'লট চেইন খুঁজুন',
    findChainSub: 'ড্রাম কোড, লট নম্বর, ব্যাচ, প্রসেস নম্বর বা শিপমেন্ট লট',
    traceButton: 'ট্রেস করুন',
    walkingChain: 'চেইন বিশ্লেষণ লোড হচ্ছে...',
    startTraceTitle: 'ট্রেস শুরু করুন',
    startTraceBody:
      'মধু সরবরাহ চেইনের যেকোনো রেফারেন্স দিন। আপনি উৎস, গন্তব্য, উৎপত্তিস্থল দেশের শতকরা হার, QSI ল্যাব ফলাফল ও প্রতিটি স্টক মুভমেন্ট দেখতে পাবেন।',
    tryRecordsLabel: 'পরীক্ষার জন্য সাম্প্রতিক রেকর্ড',
    viewChainBtn: '⛓️ ৬-ধাপ বিশিষ্ট চেইন এক্সপ্লোরার',
    viewCertBtn: '📄 অরিজিন সার্টিফিকেট প্রিভিউ',
    holdActionBtn: '🚨 তাৎক্ষণিক লট লক করুন (IFS)',
    staffViewBtn: 'অভ্যন্তরীণ ভিউ',
    inspectorViewBtn: 'পরিদর্শক ভিউ (মাস্কড)',
    whereItCameFromTitle: 'উৎস ও গন্তব্য (এক ধাপ এগিয়ে, এক ধাপ পেছনে)',
    whereItCameFromSub: 'প্রতিটি কার্ড একটি অপরিবর্তনশীল রেকর্ড — মুভমেন্ট ফিল্টার করতে ক্লিক করুন',
    kpiBatch: 'ব্যাচ নম্বর',
    kpiHoneyInBatch: 'ব্যাচে মোট মধু',
    kpiSourceCountries: 'উৎস দেশসমূহ',
    kpiRework: 'রিওয়ার্ক অনুপাত',
    col1SourceLots: '১ · ইনকামিং লট',
    col2Drums: '২ · ড্রাম / প্যাকেজ',
    col3Batch: '৩ · ব্যাচ',
    col4Process: '৪ · প্রসেস ধাপসমূহ',
    col5Rework: '৫ · রিওয়ার্ক স্টক',
    col6ShipmentLot: '৬ · শিপমেন্ট লট',
    noReworkGenerated: 'কোনো রিওয়ার্ক তৈরি হয়নি',
    nothingShippedYet: 'এখনো শিপমেন্ট রিলিজ হয়নি',
    honeyUseTitle: 'উৎস দেশ অনুযায়ী মধুর ব্যবহার ও রিওয়ার্ক',
    honeyUseSub: 'উৎস দেশ অনুযায়ী ব্যাচের অনুপাত (HonigV § 3)',
    movementHistoryTitle: 'মুভমেন্ট হিস্ট্রি ও লেজার (GOBD)',
    certOriginTitle: 'মধুর বোটানিক্যাল ও ভৌগোলিক উৎস',
    certTimelineTitle: 'উৎপাদন টাইমলাইন (মাইলফলক)',
    certSourceIntakesTitle: 'ব্যবহৃত ইনকামিং লট ও QSI সার্টিফিকেট',
    certDownloadPdf: '↓ অরিজিন সার্টিফিকেট (PDF / CSV)',
    r8ZeroForbiddenBanner:
      '১০০.০% কমপ্লায়েন্ট: নিষিদ্ধ দেশের কোনো মধু নেই (০.০% নিষিদ্ধ তালিকা)।',
    showAllMovements: 'সকল মুভমেন্ট প্রদর্শন',
    reworkFromOrigin: 'এই উৎস থেকে রিওয়ার্ক',
    sourceCountryCount: 'উৎস দেশ',
    sourceCompanyHidden: 'পরিদর্শক ভিউতে সরবরাহকারীর নাম গোপন রাখা হয়েছে।',
  },
};

// Backwards compatibility alias
export const TRACE_GERMAN_I18N = TRACE_MULTILANG_I18N;
