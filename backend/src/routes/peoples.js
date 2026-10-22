import { Router } from 'express';
import express from 'express';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/peopleController.js';
import * as posts from '../controllers/postController.js';
import { idParam, peopleCreateSchema, peopleUpdateSchema, peopleListQuery, optionsQuery, postSchema, postUpdateSchema, postCreateSchema, postListQuery } from '../utils/schemas.js';

export const peoplesRouter = Router();
const photoBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '1mb' });

peoplesRouter.get('/', validate({ query: peopleListQuery }), c.list);
peoplesRouter.get('/options', validate({ query: optionsQuery }), c.options);
peoplesRouter.get('/facets', c.facets);
peoplesRouter.post('/', validate({ body: peopleCreateSchema }), c.create);
peoplesRouter.get('/:id', validate({ params: idParam }), c.get);
peoplesRouter.patch('/:id', validate({ params: idParam, body: peopleUpdateSchema }), c.update);
peoplesRouter.delete('/:id', validate({ params: idParam }), c.remove);
peoplesRouter.get('/:id/family', validate({ params: idParam }), c.getFamily);
peoplesRouter.get('/:id/photo', validate({ params: idParam }), c.getPhoto);
peoplesRouter.put('/:id/photo', validate({ params: idParam }), photoBody, c.putPhoto);
peoplesRouter.delete('/:id/photo', validate({ params: idParam }), c.removePhoto);
peoplesRouter.get('/:id/posts', validate({ params: idParam }), posts.listForPeople);
peoplesRouter.post('/:id/posts', validate({ params: idParam, body: postSchema }), posts.createForPeople);

export const postsRouter = Router();
postsRouter.get('/', validate({ query: postListQuery }), posts.feed);
postsRouter.get('/tags', posts.tags);
postsRouter.post('/', validate({ body: postCreateSchema }), posts.create);
postsRouter.get('/:id', validate({ params: idParam }), posts.get);
postsRouter.patch('/:id', validate({ params: idParam, body: postUpdateSchema }), posts.update);
postsRouter.delete('/:id', validate({ params: idParam }), posts.remove);
