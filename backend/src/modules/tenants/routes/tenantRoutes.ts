import { Router } from 'express';
import { tenantController } from '../controllers/tenantController';

export const tenantRoutes = Router();
tenantRoutes.get('/', tenantController.list);
