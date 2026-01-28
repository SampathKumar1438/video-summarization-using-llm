import { Router } from 'express';
import {
    keywordSearch,
    semanticSearch,
    keywordSearchInVideo,
    semanticSearchInVideo
} from '../controllers/searchController.js';

const router = Router();

// Global search routes
router.get('/keyword', keywordSearch);
router.get('/semantic', semanticSearch);

// Video-specific search routes (mounted under /videos/:id/search)
export const videoSearchRouter = Router({ mergeParams: true });
videoSearchRouter.get('/keyword', keywordSearchInVideo);
videoSearchRouter.get('/semantic', semanticSearchInVideo);

export default router;
