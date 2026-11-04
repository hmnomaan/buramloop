// server/src/modules/master/master.controller.ts
import { Request, Response, NextFunction } from 'express';
import { masterService } from './master.service';

export class MasterController {
  async getRoles(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, data: await masterService.listRoles() });
    } catch (e) {
      next(e);
    }
  }

  async saveRole(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await masterService.upsertRole(req, { ...req.body, id: req.params.id });
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async getUsers(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, data: await masterService.listUsers() });
    } catch (e) {
      next(e);
    }
  }

  async saveUser(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await masterService.upsertUser(req, { ...req.body, id: req.params.id });
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async getMaterials(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await masterService.listMaterials({
        kind: req.query.kind as string | undefined,
        activeOnly: req.query.activeOnly === 'true',
      });
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async saveMaterial(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await masterService.upsertMaterial(req, { ...req.body, id: req.params.id });
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async getQualityGrades(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, data: await masterService.listQualityGrades() });
    } catch (e) {
      next(e);
    }
  }

  async saveQualityGrade(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await masterService.upsertQualityGrade(req, { ...req.body, id: req.params.id });
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async getSuppliers(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, data: await masterService.listSuppliers() });
    } catch (e) {
      next(e);
    }
  }

  async saveSupplier(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await masterService.upsertSupplier(req, { ...req.body, id: req.params.id });
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async getCustomers(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, data: await masterService.listCustomers() });
    } catch (e) {
      next(e);
    }
  }

  async saveCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await masterService.upsertCustomer(req, { ...req.body, id: req.params.id });
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async getInfrastructure(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, data: await masterService.listInfrastructure() });
    } catch (e) {
      next(e);
    }
  }

  async saveStockThreshold(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await masterService.upsertStockThreshold(req, req.body);
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async getCounters(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, data: await masterService.listCounters() }); // Admin-only endpoint
    } catch (e) {
      next(e);
    }
  }

  async overrideCounter(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await masterService.overrideCounter(req, req.body);
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }
}

export const masterController = new MasterController();