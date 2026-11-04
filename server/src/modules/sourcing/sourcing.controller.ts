// server/src/modules/sourcing/sourcing.controller.ts
import { Request, Response, NextFunction } from 'express';
import { sourcingService } from './sourcing.service';

export class SourcingController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await sourcingService.listSourcings(req, {
        status: req.query.status as string | undefined,
        stage: req.query.stage as string | undefined,
      });
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async listLeads(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await sourcingService.listSupplierLeads(req, {
        country: typeof req.query.country === 'string' ? req.query.country : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        leadStatus:
          req.query.leadStatus === 'LEAD' ||
          req.query.leadStatus === 'ACTIVE_PARTNER' ||
          req.query.leadStatus === 'ON_HOLD'
            ? req.query.leadStatus
            : undefined,
      });
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async createLead(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await sourcingService.createSupplierLead(req, req.body);
      res.status(201).json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async updateLeadStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const data = await sourcingService.updateSupplierLeadStatus(
        req,
        id,
        req.body
      );
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async listShippedContracts(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await sourcingService.listShippedContracts(req);
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await sourcingService.createSourcing(req, req.body);
      res.status(201).json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async evaluateGate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const data = await sourcingService.evaluateGate(req, id, req.body);
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async createContract(req: Request, res: Response, next: NextFunction) {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const data = await sourcingService.createContractFromSourcing(req, id, req.body);
      res.status(201).json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async markShipped(req: Request, res: Response, next: NextFunction) {
    try {
        const contractId = Array.isArray(req.params.contractId) ? req.params.contractId[0] : req.params.contractId;
      const data = await sourcingService.markContractShipped(req, contractId, req.body);
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async listPrices(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await sourcingService.listAdminPrices(req);
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }

  async createPrice(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await sourcingService.upsertAdminPrice(req, req.body);
      res.status(201).json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  }
}

export const sourcingController = new SourcingController();