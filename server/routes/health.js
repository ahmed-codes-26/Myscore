import express from 'express';
import { isDBConnected } from '../db.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: isDBConnected() ? 'connected' : 'disconnected'
  });
});

export default router;
