import { Router } from 'express';
import type { Pool } from 'pg';
import { asyncHandler } from '../middleware/asyncHandler';
import { jwtAuth } from '../middleware/jwtAuth';
import * as projectService from '../services/projectService';
import { createProjectSchema, updateProjectSchema } from '../validators/projectValidators';

export function projectsRouter(pool: Pool, jwtSecret: string): Router {
  const router = Router();
  router.use(jwtAuth(jwtSecret));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const projects = await projectService.listProjects(pool, req.user!.organizationId);
      res.json({ projects });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = createProjectSchema.parse(req.body);
      const project = await projectService.createProject(pool, req.user!.organizationId, req.user!.id, input);
      res.status(201).json(project);
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const project = await projectService.getProject(pool, req.user!.organizationId, req.params.id);
      res.json(project);
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const input = updateProjectSchema.parse(req.body);
      const project = await projectService.updateProject(pool, req.user!.organizationId, req.params.id, input);
      res.json(project);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await projectService.deleteProject(pool, req.user!.organizationId, req.params.id);
      res.status(204).send();
    }),
  );

  return router;
}
