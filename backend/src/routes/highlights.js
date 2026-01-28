import { Router } from 'express';
import {
    getHighlights,
    streamHighlight,
    regenerateHighlight,
    getHighlightStatus
} from '../controllers/highlightController.js';

const router = Router({ mergeParams: true });

// Highlight routes (mounted under /videos/:id/highlights)
router.get('/', getHighlights);
router.get('/stream', streamHighlight);
router.post('/regenerate', regenerateHighlight);
router.get('/status', getHighlightStatus);

export default router;
