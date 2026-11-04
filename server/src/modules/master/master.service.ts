// server/src/modules/master/master.service.ts
import argon2 from 'argon2';
import { Request } from 'express';
import { Types } from 'mongoose';
import { withTransaction } from '../../config/db';
import { AppError } from '../../common/errors';
import { recordAudit } from '../../common/audit.helper';
import { MaterialKind, MaterialUnit } from '../../../../shared/src/schemas/master';
import {
  RoleModel,
  UserModel,
  MaterialModel,
  QualityGradeModel,
  SupplierModel,
  CabinetModel,
  TankModel,
  FillLineModel,
  CustomerModel,
  StockThresholdModel,
  CounterModel,
} from '../../models';

export class MasterService {
  // ==========================================================================
  // 1. ROLES (Admin creates/updates roles & permissions) [R2, R14]
  // ==========================================================================
  async listRoles() {
    return RoleModel.find().sort({ name: 1 }).lean();
  }

  async upsertRole(
    req: Request,
    payload: {
      id?: string;
      name: string;
      description?: string;
      permissions: string[];
      isActive?: boolean;
      reason: string;
    }
  ) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      if (payload.id) {
        const existing = await RoleModel.findById(payload.id).session(session);
        if (!existing) throw AppError.notFound('Role', payload.id);
        const before = existing.toObject();

        existing.name = payload.name.trim();
        if (payload.description !== undefined) existing.description = payload.description.trim();
        existing.permissions = payload.permissions;
        if (payload.isActive !== undefined) existing.isActive = payload.isActive;
        await existing.save({ session });

        await recordAudit({
          req,
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'master',
          action: 'UPDATE',
          entityType: 'ROLE',
          entityId: existing._id,
          entityRef: existing.name,
          before,
          after: existing.toObject(),
          reason: payload.reason,
          session,
        });
        return existing;
      }

      const [created] = await RoleModel.create(
        [
          {
            name: payload.name.trim(),
            description: payload.description?.trim(),
            permissions: payload.permissions,
            isSystem: false,
            isActive: payload.isActive ?? true,
          },
        ],
        { session }
      );

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'master',
        action: 'CREATE',
        entityType: 'ROLE',
        entityId: created._id,
        entityRef: created.name,
        after: created.toObject(),
        reason: payload.reason,
        session,
      });
      return created;
    });
  }

  // ==========================================================================
  // 2. USERS (Admin creates/updates users & role assignments) [R2, R14]
  // ==========================================================================
  async listUsers() {
    return UserModel.find()
      .select('-passwordHash')
      .populate('roleId', 'name permissions')
      .sort({ fullName: 1 })
      .lean();
  }

  async upsertUser(
    req: Request,
    payload: {
      id?: string;
      email: string;
      fullName: string;
      password?: string;
      roleId: string;
      isActive?: boolean;
      reason: string;
    }
  ) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      const role = await RoleModel.findById(payload.roleId).session(session);
      if (!role) throw AppError.notFound('Role', payload.roleId);

      if (payload.id) {
        const existing = await UserModel.findById(payload.id).session(session);
        if (!existing) throw AppError.notFound('User', payload.id);
        const before = { ...existing.toObject(), passwordHash: '[REDACTED]' };

        existing.email = payload.email.toLowerCase().trim();
        existing.fullName = payload.fullName.trim();
        existing.roleId = new Types.ObjectId(payload.roleId);
        if (payload.isActive !== undefined) existing.isActive = payload.isActive;
        if (payload.password && payload.password.length < 10) {
          throw AppError.badRequest(
            'PASSWORD_TOO_SHORT',
            'Replacement passwords must be at least 10 characters.'
          );
        }
        if (payload.password) {
          existing.passwordHash = await argon2.hash(payload.password);
          existing.mustChangePassword = true;
          existing.tokenVersion = (existing.tokenVersion ?? 0) + 1;
        }
        await existing.save({ session });

        await recordAudit({
          req,
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'master',
          action: 'UPDATE',
          entityType: 'USER',
          entityId: existing._id,
          entityRef: existing.email,
          before,
          after: { ...existing.toObject(), passwordHash: '[REDACTED]' },
          reason: payload.reason,
          session,
        });
        return { id: existing._id, email: existing.email, fullName: existing.fullName, isActive: existing.isActive };
      }

      if (!payload.password || payload.password.length < 10) {
        throw AppError.badRequest('PASSWORD_REQUIRED', 'New user requires a password of at least 10 characters');
      }

      const passwordHash = await argon2.hash(payload.password);
      const [created] = await UserModel.create(
        [
          {
            email: payload.email.toLowerCase().trim(),
            fullName: payload.fullName.trim(),
            passwordHash,
            roleId: new Types.ObjectId(payload.roleId),
            isActive: payload.isActive ?? true,
            mustChangePassword: true,
            createdBy: actor.userId,
          },
        ],
        { session }
      );

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'master',
        action: 'CREATE',
        entityType: 'USER',
        entityId: created._id,
        entityRef: created.email,
        after: { id: created._id, email: created.email, fullName: created.fullName, roleId: created.roleId },
        reason: payload.reason,
        session,
      });

      return { id: created._id, email: created.email, fullName: created.fullName, isActive: created.isActive };
    });
  }

  // ==========================================================================
  // 3. MATERIALS (Admin creates material name first; kind drives logic) [R2]
  // ==========================================================================
  async listMaterials(filter: { kind?: string; activeOnly?: boolean } = {}) {
    const query: Record<string, unknown> = {};
    if (filter.kind) query.kind = filter.kind;
    if (filter.activeOnly) query.isActive = true;
    return MaterialModel.find(query).sort({ kind: 1, name: 1 }).lean();
  }

  async upsertMaterial(
    req: Request,
    payload: {
      id?: string;
      code: string;
      name: string;
      kind: MaterialKind;
      category: string;
      unit: MaterialUnit;
      defaultDrumKg?: number;
      defaultPackageType?: string;
      isAllergen?: boolean;
      countsTowardOrigin?: boolean;
      isActive?: boolean;
      reason: string;
    }
  ) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      if (payload.id) {
        const existing = await MaterialModel.findById(payload.id).session(session);
        if (!existing) throw AppError.notFound('Material', payload.id);
        const before = existing.toObject();

        existing.code = payload.code.toUpperCase().trim();
        existing.name = payload.name.trim();
        existing.kind = payload.kind;
        existing.category = payload.category.trim();
        if (existing.unit !== payload.unit) {
          throw AppError.conflict(
            'MATERIAL_UNIT_IMMUTABLE',
            'A material unit cannot be changed after creation. Create a new material to preserve historical quantities.'
          );
        }
        existing.unit = payload.unit;
        if (payload.defaultDrumKg !== undefined) {
          existing.defaultDrumKg = payload.defaultDrumKg;
        }
        existing.defaultPackageType = payload.defaultPackageType?.trim();
        existing.isAllergen = payload.isAllergen ?? false;
        existing.countsTowardOrigin = payload.countsTowardOrigin ?? true;
        if (payload.isActive !== undefined) existing.isActive = payload.isActive;
        await existing.save({ session });

        await recordAudit({
          req,
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'master',
          action: 'UPDATE',
          entityType: 'MATERIAL',
          entityId: existing._id,
          entityRef: existing.code,
          before,
          after: existing.toObject(),
          reason: payload.reason,
          session,
        });
        return existing;
      }

      const [created] = await MaterialModel.create(
        [
          {
            code: payload.code.toUpperCase().trim(),
            name: payload.name.trim(),
            kind: payload.kind,
            category: payload.category.trim(),
            unit: payload.unit,
            ...(payload.unit === 'kg'
              ? { defaultDrumKg: payload.defaultDrumKg ?? 290 }
              : {}),
            defaultPackageType: payload.defaultPackageType?.trim(),
            isAllergen: payload.isAllergen ?? false,
            countsTowardOrigin: payload.countsTowardOrigin ?? true,
            isActive: payload.isActive ?? true,
          },
        ],
        { session }
      );

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'master',
        action: 'CREATE',
        entityType: 'MATERIAL',
        entityId: created._id,
        entityRef: created.code,
        after: created.toObject(),
        reason: payload.reason,
        session,
      });
      return created;
    });
  }

  // ==========================================================================
  // 4. QUALITY GRADES (Quality1-3 + Admin additions) [R2]
  // ==========================================================================
  async listQualityGrades() {
    return QualityGradeModel.find().sort({ rank: 1 }).lean();
  }

  async upsertQualityGrade(
    req: Request,
    payload: {
      id?: string;
      code: string;
      name: string;
      rank: number;
      description?: string;
      isActive?: boolean;
      reason: string;
    }
  ) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      if (payload.id) {
        const existing = await QualityGradeModel.findById(payload.id).session(session);
        if (!existing) throw AppError.notFound('QualityGrade', payload.id);
        const before = existing.toObject();

        existing.code = payload.code.toUpperCase().trim();
        existing.name = payload.name.trim();
        existing.rank = payload.rank;
        if (payload.description !== undefined) existing.description = payload.description.trim();
        if (payload.isActive !== undefined) existing.isActive = payload.isActive;
        await existing.save({ session });

        await recordAudit({
          req,
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'master',
          action: 'UPDATE',
          entityType: 'QUALITY_GRADE',
          entityId: existing._id,
          entityRef: existing.code,
          before,
          after: existing.toObject(),
          reason: payload.reason,
          session,
        });
        return existing;
      }

      const [created] = await QualityGradeModel.create(
        [
          {
            code: payload.code.toUpperCase().trim(),
            name: payload.name.trim(),
            rank: payload.rank,
            description: payload.description?.trim(),
            isActive: payload.isActive ?? true,
          },
        ],
        { session }
      );

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'master',
        action: 'CREATE',
        entityType: 'QUALITY_GRADE',
        entityId: created._id,
        entityRef: created.code,
        after: created.toObject(),
        reason: payload.reason,
        session,
      });
      return created;
    });
  }

  // ==========================================================================
  // 5. SUPPLIERS & CUSTOMERS (1-3 Allowed Countries Rule) [R1, R8]
  // ==========================================================================
  async listSuppliers() {
    return SupplierModel.find().sort({ name: 1 }).lean();
  }

  
  async upsertSupplier(
    req: Request,
    payload: {
      id?: string;
      code: string;
      name: string;
      country: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
      isActive?: boolean;
      reason: string;
    }
  ) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      if (payload.id) {
        const existing = await SupplierModel.findById(payload.id).session(session);
        if (!existing) throw AppError.notFound('Supplier', payload.id);
        const before = existing.toObject();

        Object.assign(existing, {
          code: payload.code.toUpperCase().trim(),
          name: payload.name.trim(),
          country: payload.country.toUpperCase().trim(),
          contactName: payload.contactName?.trim(),
          contactEmail: payload.contactEmail?.trim(),
          contactPhone: payload.contactPhone?.trim(),
          address: payload.address?.trim(),
          ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
        });
        await existing.save({ session });

        await recordAudit({
          req,
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'master',
          action: 'UPDATE',
          entityType: 'SUPPLIER',
          entityId: existing._id,
          entityRef: existing.code,
          before,
          after: existing.toObject(),
          reason: payload.reason,
          session,
        });
        return existing;
      }

      const [created] = await SupplierModel.create(
        [
          {
            code: payload.code.toUpperCase().trim(),
            name: payload.name.trim(),
            country: payload.country.toUpperCase().trim(),
            contactName: payload.contactName?.trim(),
            contactEmail: payload.contactEmail?.trim(),
            contactPhone: payload.contactPhone?.trim(),
            address: payload.address?.trim(),
            isActive: payload.isActive ?? true,
          },
        ],
        { session }
      );

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'master',
        action: 'CREATE',
        entityType: 'SUPPLIER',
        entityId: created._id,
        entityRef: created.code,
        after: created.toObject(),
        reason: payload.reason,
        session,
      });
      return created;
    });
  }

  async listCustomers() {
    return CustomerModel.find().sort({ name: 1 }).lean();
  }

  async upsertCustomer(req: Request, payload: any) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      if (payload.id) {
        const existing = await CustomerModel.findById(payload.id).session(session);
        if (!existing) throw AppError.notFound('Customer', payload.id);
        const before = existing.toObject();

        Object.assign(existing, {
          code: payload.code.toUpperCase().trim(),
          name: payload.name.trim(),
          country: payload.country.toUpperCase().trim(),
          allowedCountries: payload.allowedCountries,
          blockedCountries: payload.blockedCountries ?? [],
          allowReworkHoney: payload.allowReworkHoney ?? true,
          maxReworkSharePct: payload.maxReworkSharePct ?? 30,
          contactName: payload.contactName,
          contactEmail: payload.contactEmail,
          contactPhone: payload.contactPhone,
          address: payload.address,
          ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
        });
        await existing.save({ session });

        await recordAudit({
          req,
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'master',
          action: 'UPDATE',
          entityType: 'CUSTOMER',
          entityId: existing._id,
          entityRef: existing.code,
          before,
          after: existing.toObject(),
          reason: payload.reason,
          session,
        });
        return existing;
      }

      const [created] = await CustomerModel.create(
        [
          {
            ...payload,
            createdBy: actor.userId,
          },
        ],
        { session }
      );

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'master',
        action: 'CREATE',
        entityType: 'CUSTOMER',
        entityId: created._id,
        entityRef: created.code,
        after: created.toObject(),
        reason: payload.reason,
        session,
      });
      return created;
    });
  }

  // ==========================================================================
  // 6. WARM CABINETS, TANKS, FILL LINES & STOCK THRESHOLDS [R5, R7, R10]
  // ==========================================================================
  async listInfrastructure() {
    const [cabinets, tanks, fillLines, thresholds] = await Promise.all([
      CabinetModel.find().sort({ code: 1 }).lean(),
      TankModel.find().sort({ code: 1 }).lean(),
      FillLineModel.find().sort({ code: 1 }).lean(),
      StockThresholdModel.find().populate('materialId', 'code name kind').lean(),
    ]);
    return { cabinets, tanks, fillLines, thresholds };
  }

  async upsertStockThreshold(req: Request, payload: any) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      const country = payload.country ? payload.country.toUpperCase().trim() : null;
      const existing = await StockThresholdModel.findOne({
        materialId: payload.materialId,
        country,
      }).session(session);

      if (existing) {
        const before = existing.toObject();
        existing.minApprovedFreeKg = payload.minApprovedFreeKg;
        existing.minApprovedFreeDrums = payload.minApprovedFreeDrums;
        existing.isActive = payload.isActive ?? true;
        existing.updatedBy = actor.userId;
        await existing.save({ session });

        await recordAudit({
          req,
          actorId: actor.userId,
          actorRole: actor.roleName,
          module: 'master',
          action: 'UPDATE',
          entityType: 'STOCK_THRESHOLD',
          entityId: existing._id,
          before,
          after: existing.toObject(),
          reason: payload.reason,
          session,
        });
        return existing;
      }

      const [created] = await StockThresholdModel.create(
        [
          {
            materialId: new Types.ObjectId(payload.materialId),
            country,
            minApprovedFreeKg: payload.minApprovedFreeKg,
            minApprovedFreeDrums: payload.minApprovedFreeDrums,
            isActive: payload.isActive ?? true,
            updatedBy: actor.userId,
          },
        ],
        { session }
      );

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'master',
        action: 'CREATE',
        entityType: 'STOCK_THRESHOLD',
        entityId: created._id,
        after: created.toObject(),
        reason: payload.reason,
        session,
      });
      return created;
    });
  }

  // ==========================================================================
  // 7. SEQUENCE COUNTERS (Admin inspection & override with reason) [R2]
  // ==========================================================================
  async listCounters() {
    return CounterModel.find().sort({ key: 1 }).lean();
  }

  async overrideCounter(
    req: Request,
    payload: { key: string; seq: number; prefix?: string; reason: string }
  ) {
    return withTransaction(async (session) => {
      const actor = req.user!;
      const existing = await CounterModel.findOne({ key: payload.key }).session(session);
      const before = existing ? existing.toObject() : null;

      const updated = await CounterModel.findOneAndUpdate(
        { key: payload.key },
        { $set: { seq: payload.seq, ...(payload.prefix ? { prefix: payload.prefix } : {}) } },
        { upsert: true, new: true, session }
      );

      await recordAudit({
        req,
        actorId: actor.userId,
        actorRole: actor.roleName,
        module: 'master',
        action: 'UPDATE',
        entityType: 'COUNTER',
        entityId: updated!._id,
        entityRef: payload.key,
        before,
        after: updated!.toObject(),
        reason: payload.reason,
        session,
      });

      return updated;
    });
  }
}

export const masterService = new MasterService();