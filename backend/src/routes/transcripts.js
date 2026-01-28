import { Router } from 'express';
import {
    getTranscript,
    getTranscriptAtTime,
    getSummary,
    getNotes,
    getTodos,
    toggleTodo,
    getChapters
} from '../controllers/transcriptController.js';

const router = Router();

// Transcript routes
router.get('/:id/transcript', getTranscript);
router.get('/:id/transcript/segment', getTranscriptAtTime);

// Analysis routes
router.get('/:id/summary', getSummary);
router.get('/:id/notes', getNotes);
router.get('/:id/todos', getTodos);
router.patch('/:id/todos/:todoId', toggleTodo);
router.get('/:id/chapters', getChapters);

export default router;
