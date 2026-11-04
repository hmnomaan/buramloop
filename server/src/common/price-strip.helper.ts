// server/src/common/price-strip.helper.ts
export function canRoleViewPrices(roleName: string): boolean {
    return (
        roleName === 'Admin' ||
        roleName === 'ADMIN' ||
        roleName === 'Management' ||
        roleName === 'MANAGEMENT'
    );
}

export function sanitizeOriginSlicesForRole<
    TSlice extends {
        unitPriceEurPerKg?: number;
        valueEur?: number;
        costValueEur?: number;
        costSharePct?: number;
    }
>(slices: TSlice[], roleName: string): Array<Omit<TSlice, 'unitPriceEurPerKg' | 'valueEur' | 'costValueEur' | 'costSharePct'> & Partial<Pick<TSlice, 'unitPriceEurPerKg' | 'valueEur' | 'costValueEur' | 'costSharePct'>>> {
    if (canRoleViewPrices(roleName)) {
        return slices;
    }
    return slices.map(
        ({ unitPriceEurPerKg: _u, valueEur: _v, costValueEur: _c, costSharePct: _p, ...publicSlice }) =>
            publicSlice
    );
}

const COMMERCIAL_FIELDS = new Set([
    'unitPriceEurPerKg',
    'unitPricePerKg',
    'inputPriceEur',
    'transportCostEur',
    'transportEurPerKg',
    'landedUnitPriceEurPerKg',
    'totalOfferValueEur',
    'totalLandedValueEur',
    'totalCostValueEur',
    'totalValueEur',
    'valueEur',
    'costValueEur',
    'costSharePct',
    'weightedAvgEurPerKg',
    'sellingPriceEurPerKg',
    'totalRevenueEur',
    'marginEur',
    'marginPct',
]);

export function sanitizeCommercialDataForRole<T>(
    value: T,
    roleName: string
): T {
    if (canRoleViewPrices(roleName)) return value;
    if (Array.isArray(value)) {
        return value.map((item) =>
            sanitizeCommercialDataForRole(item, roleName)
        ) as T;
    }
    if (!value || typeof value !== 'object' || value instanceof Date) return value;
    if ('_bsontype' in value || Buffer.isBuffer(value)) return value;

    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
        if (!COMMERCIAL_FIELDS.has(key)) {
            result[key] = sanitizeCommercialDataForRole(nestedValue, roleName);
        }
    }
    return result as T;
}