import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as c from '../controllers/contactController.js';
import { idParam, contactCreateSchema, contactUpdateSchema, contactListQuery, vcfImportSchema } from '../utils/schemas.js';

export const contactsRouter = Router();
contactsRouter.get('/', validate({ query: contactListQuery }), c.list);
contactsRouter.get('/relatives', c.relatives);
contactsRouter.post('/', validate({ body: contactCreateSchema }), c.create);
contactsRouter.post('/import-vcf', validate({ body: vcfImportSchema }), c.importVcf);
contactsRouter.patch('/:id', validate({ params: idParam, body: contactUpdateSchema }), c.update);
contactsRouter.delete('/:id', validate({ params: idParam }), c.remove);
