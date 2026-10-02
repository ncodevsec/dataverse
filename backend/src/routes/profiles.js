import { Router } from 'express';
import express from 'express';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/profileController.js';
import { idParam, profileCreateSchema, profileUpdateSchema, profileListQuery, optionsQuery, postSchema, postUpdateSchema } from '../utils/schemas.js';

export const profilesRouter = Router();
const photoBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '1mb' });

profilesRouter.get('/', validate({ query: profileListQuery }), c.list);
profilesRouter.get('/options', validate({ query: optionsQuery }), c.options);
profilesRouter.get('/facets', c.facets);
profilesRouter.post('/', validate({ body: profileCreateSchema }), c.create);
profilesRouter.get('/:id', validate({ params: idParam }), c.get);
profilesRouter.patch('/:id', validate({ params: idParam, body: profileUpdateSchema }), c.update);
profilesRouter.delete('/:id', validate({ params: idParam }), c.remove);
profilesRouter.get('/:id/family', validate({ params: idParam }), c.getFamily);
profilesRouter.get('/:id/photo', validate({ params: idParam }), c.getPhoto);
profilesRouter.put('/:id/photo', validate({ params: idParam }), photoBody, c.putPhoto);
profilesRouter.delete('/:id/photo', validate({ params: idParam }), c.removePhoto);
profilesRouter.get('/:id/posts', validate({ params: idParam }), c.listPosts);
profilesRouter.post('/:id/posts', validate({ params: idParam, body: postSchema }), c.createPost);

export const postsRouter = Router();
postsRouter.patch('/:id', validate({ params: idParam, body: postUpdateSchema }), c.updatePost);
postsRouter.delete('/:id', validate({ params: idParam }), c.removePost);
