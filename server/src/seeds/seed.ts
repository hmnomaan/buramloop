import mongoose from 'mongoose';
import argon2 from 'argon2';
import { env } from '../config/env';
import {
  CabinetModel,
  CustomerModel,
  FillLineModel,
  MaterialModel,
  QualityGradeModel,
  RoleModel,
  SupplierModel,
  TankModel,
  UserModel,
  syncAllModelIndexes,
} from '../models';
import { WAREHOUSE_ROLE_PERMISSIONS } from '../modules/auth/rolePermissions';

const ROLE_DEFINITIONS: Array<{
  name: string;
  description: string;
  permissions: string[];
}> = [
  {
    name: 'Admin',
    description: 'Full system access including pricing, cost reports, and master overrides',
    permissions: ['*:*'],
  },
  {
    name: 'Management',
    description: 'Approves external analysis on sourcing, reviews batch feasibility and cost reports',
    permissions: [
      'management:approve',
      'management:view',
      'sourcing:read',
      'stock:read',
      'batches:read',
      'batches:approve',
      'shipments:read',
      'reports:read',
      'trace:read',
      'exports:run',
    ],
  },
  {
    name: 'QA',
    description: 'In-house sensory + QSI lab verification, lot PASS/FAIL gating, and shipment release',
    permissions: [
      'sourcing:read',
      'qa:approve',
      'stock:read',
      'batches:read',
      'shipments:read',
      'attachments:write',
      'attachments:read',
      'trace:read',
      'exports:run',
    ],
  },
  {
    name: 'Warehouse',
    description: 'Incoming lot receipt, drum listing, warm cabinet check IN/OUT',
    permissions: [...WAREHOUSE_ROLE_PERMISSIONS],
  },
  {
    name: 'Production',
    description: 'Warm cabinet check OUT, filtration, blending, resting tank, filling, and rework logging',
    permissions: [
      'warmroom:write',
      'warmroom:read',
      'batches:read',
      'batches:write',
      'processing:write',
      'processing:read',
      'rework:write',
      'rework:read',
      'attachments:write',
      'attachments:read',
      'exports:run',
    ],
  },
  {
    name: 'Inspector',
    description: 'Government inspection read-only access (prices and unrelated commercial data masked)',
    permissions: ['trace:read', 'stock:read', 'batches:read', 'shipments:read', 'attachments:read', 'exports:run'],
  },
];

async function seedAdmin(adminRoleId: mongoose.Types.ObjectId) {
  const email = 'admin@buram.de';
  const existingAdmin = await UserModel.findOne({ email });
  if (existingAdmin) {
    console.log(`[SEED] Existing admin account preserved: ${email}`);
    return existingAdmin;
  }

  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set to at least 8 characters to create the initial admin account.'
    );
  }

  const admin = await UserModel.create({
    email,
    fullName: 'Buram System Admin',
    passwordHash: await argon2.hash(password),
    roleId: adminRoleId,
    isActive: true,
  });
  console.log(`[SEED] Created initial admin account: ${email}`);
  return admin;
}

async function runSeed(): Promise<void> {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.MONGO_URI);
    await syncAllModelIndexes();
    console.log('[SEED] Connected to MongoDB and synchronized indexes.');

    const rolesByName = new Map<string, mongoose.Types.ObjectId>();
    for (const role of ROLE_DEFINITIONS) {
      const savedRole = await RoleModel.findOneAndUpdate(
        { name: role.name },
        {
          $set: {
            description: role.description,
            permissions: role.permissions,
            isSystem: true,
            isActive: true,
          },
        },
        { new: true, upsert: true, runValidators: true }
      );
      rolesByName.set(role.name, savedRole._id);
    }

    const adminRoleId = rolesByName.get('Admin');
    if (!adminRoleId) {
      throw new Error('Admin system role was not created.');
    }
    const admin = await seedAdmin(adminRoleId);

    const grades = [
      { code: 'QUALITY_1', name: 'Quality 1', rank: 1, description: 'Premium export grade honey' },
      { code: 'QUALITY_2', name: 'Quality 2', rank: 2, description: 'Standard retail & blending grade' },
      { code: 'QUALITY_3', name: 'Quality 3', rank: 3, description: 'Industrial / baking grade' },
    ];
    for (const grade of grades) {
      await QualityGradeModel.findOneAndUpdate(
        { code: grade.code },
        {
          $set: grade,
          $setOnInsert: { isActive: true },
        },
        { upsert: true, runValidators: true }
      );
    }

    const cabinets = [
      { code: 'CAB-01', name: 'Warm Cabinet 1 (17 Drums)', capacityDrums: 17, targetTempC: 45, minWarmHours: 24, maxWarmHours: 48 },
      { code: 'CAB-02', name: 'Warm Cabinet 2 (17 Drums)', capacityDrums: 17, targetTempC: 45, minWarmHours: 24, maxWarmHours: 48 },
    ];
    for (const cabinet of cabinets) {
      await CabinetModel.findOneAndUpdate(
        { code: cabinet.code },
        { $setOnInsert: { ...cabinet, occupiedSlots: [], isActive: true } },
        { upsert: true, runValidators: true }
      );
    }

    const tanks = [
      { code: 'TANK-01', name: 'Resting Tanks (9.5t*3)', capacityKg: 9500 },
      { code: 'TANK-02', name: 'Blending Tanks (14t*3)', capacityKg: 14000 },
    ];
    for (const tank of tanks) {
      await TankModel.findOneAndUpdate(
        { code: tank.code },
        {
          $set: { name: tank.name, capacityKg: tank.capacityKg },
          $setOnInsert: { isActive: true },
        },
        { upsert: true, runValidators: true }
      );
    }

    const fillLines = [
      { code: 'QUIEL_PET', name: 'Quiel PET Filling Line', description: 'Automated PET squeeze bottle line' },
      { code: 'CARLO_JAR', name: 'Carlo Glass Jar Filling Line', description: 'Automated glass jar & clamp jar line' },
      { code: 'HAND', name: 'Hand Filling Station', description: 'Manual specialty, comb, and bulk pail/drum filling' },
    ];
    for (const fillLine of fillLines) {
      await FillLineModel.findOneAndUpdate(
        { code: fillLine.code },
        {
          $set: { name: fillLine.name, description: fillLine.description },
          $setOnInsert: { isActive: true },
        },
        { upsert: true, runValidators: true }
      );
    }

    const materials = [
      { code: 'MAT-HON-BLOSSOM', name: 'Blossom Honey (Blütenhonig)', kind: 'HONEY', category: 'Polyfloral Honey', unit: 'kg', defaultDrumKg: 290 },
      { code: 'MAT-HON-ACACIA', name: 'Acacia Honey (Akazienhonig)', kind: 'HONEY', category: 'Monofloral Honey', unit: 'kg', defaultDrumKg: 290 },
      { code: 'MAT-HON-PINE', name: 'Pine Honey (Tannenhonig / Çam Balı)', kind: 'HONEY', category: 'Forest Honey', unit: 'kg', defaultDrumKg: 290 },
      { code: 'MAT-POL-RAW', name: 'Bee Pollen (Bienenpollen)', kind: 'POLLEN', category: 'Pollen', unit: 'kg', defaultDrumKg: 25 },
      { code: 'MAT-FLV-CINNAMON', name: 'Natural Cinnamon Flavour', kind: 'FLAVOUR', category: 'Natural Flavouring', unit: 'kg', defaultDrumKg: 10 },
    ];
    for (const material of materials) {
      await MaterialModel.findOneAndUpdate(
        { code: material.code },
        {
          $set: material,
          $setOnInsert: { isActive: true },
        },
        { upsert: true, runValidators: true }
      );
    }

    await SupplierModel.findOneAndUpdate(
      { code: 'SUP-RO-01' },
      {
        $set: { name: 'Apicola Danubius SRL', country: 'RO' },
        $setOnInsert: { isActive: true },
      },
      { upsert: true, runValidators: true }
    );

    await CustomerModel.findOneAndUpdate(
      { code: 'CUST-REWE-DE' },
      {
        $set: {
          name: 'REWE Group Zentrale',
          country: 'DE',
          allowedCountries: ['DE', 'RO'],
          blockedCountries: ['CN'],
        },
        $setOnInsert: {
          allowReworkHoney: true,
          maxReworkSharePct: 30,
          isActive: true,
          createdBy: admin._id,
        },
      },
      { upsert: true, runValidators: true }
    );

    console.log('[SEED] Roles, quality grades, production infrastructure, materials, supplier, and customer are ready.');
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

void runSeed().catch((error: unknown) => {
  console.error('[SEED_ERROR]', error);
  process.exitCode = 1;
});
