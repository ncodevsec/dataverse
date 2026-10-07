import { Router } from 'express';
import express from 'express';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/orgController.js';
import * as posts from '../controllers/postController.js';
import * as links from '../controllers/linkController.js';
import { idParam, orgCreateSchema, orgUpdateSchema, orgListQuery, orgOptionsQuery, postSchema, structureQuery, pageParamsQuery } from '../utils/schemas.js';

export const organizationsRouter = Router();
const photoBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '1mb' });

organizationsRouter.get('/', validate({ query: orgListQuery }), c.list);
organizationsRouter.get('/options', validate({ query: orgOptionsQuery }), c.options);
organizationsRouter.get('/facets', c.facets);
organizationsRouter.post('/', validate({ body: orgCreateSchema }), c.create);
organizationsRouter.get('/:id', validate({ params: idParam }), c.get);
organizationsRouter.patch('/:id', validate({ params: idParam, body: orgUpdateSchema }), c.update);
organizationsRouter.delete('/:id', validate({ params: idParam }), c.remove);
organizationsRouter.get('/:id/photo', validate({ params: idParam }), c.getPhoto);
organizationsRouter.put('/:id/photo', validate({ params: idParam }), photoBody, c.putPhoto);
organizationsRouter.delete('/:id/photo', validate({ params: idParam }), c.removePhoto);
organizationsRouter.get('/:id/posts', validate({ params: idParam }), posts.listForOrganization);
organizationsRouter.post('/:id/posts', validate({ params: idParam, body: postSchema }), posts.createForOrganization);
organizationsRouter.get('/:id/relations', validate({ params: idParam }), links.relations);
organizationsRouter.get('/:id/members', validate({ params: idParam, query: pageParamsQuery }), links.members);
organizationsRouter.get('/:id/structure', validate({ params: idParam, query: structureQuery }), links.structure);
