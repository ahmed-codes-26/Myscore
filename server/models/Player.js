import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // Client UUID
    name: { type: String, required: true, trim: true },
    role: { type: String, default: '' },
    isGuest: { type: Boolean, default: false },
    syncedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    _id: false // Use client-provided UUID as _id
  }
);

export const Player = mongoose.models.Player || mongoose.model('Player', playerSchema);
