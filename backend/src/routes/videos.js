import { Router } from 'express';
import multer from 'multer';
import {
    uploadVideo,
    getAllVideos,
    getVideo,
    getVideoStatus,
    streamVideo,
    deleteVideo
} from '../controllers/videoController.js';

const router = Router();

// Configure multer for video uploads
const upload = multer({
    dest: 'storage/uploads/',
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024 // 5GB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only video files are allowed.'));
        }
    }
});

// Routes
router.post('/upload', upload.single('file'), uploadVideo);
router.get('/', getAllVideos);
router.get('/:id', getVideo);
router.get('/:id/status', getVideoStatus);
router.get('/:id/stream', streamVideo);
router.delete('/:id', deleteVideo);

export default router;
