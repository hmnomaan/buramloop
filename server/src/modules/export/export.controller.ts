// server/src/modules/export/export.controller.ts
import { Request, Response, NextFunction } from 'express';
import { ExportService } from './export.service';

export class ExportController {
  static async runExport(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const result = await ExportService.runSnapshotExport({
        dataset: req.body.dataset || 'DRUM_STOCK',
        format: req.body.format || 'CSV',
        saveToNextcloud: Boolean(req.body.saveToNextcloud),
        actorId: user.userId || user.id,
        actorRole: user.roleName || user.role,
      });
      res.status(201).json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async listLogs(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ExportService.listExportLogs();
      res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  }
}