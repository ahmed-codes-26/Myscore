import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // Client UUID
    matchId: { type: String, required: true, index: true },
    innings: { type: Number, required: true, enum: [1, 2] },
    sequence: { type: Number, required: true },
    type: {
      type: String,
      required: true,
      enum: ['delivery', 'swap', 'declare']
    },
    isDeleted: { type: Boolean, default: false, index: true },

    // Delivery-specific fields
    isLegal: { type: Boolean },
    ballInOver: { type: Number },
    runsOffBat: { type: Number, default: 0 },
    extraType: { type: String, default: null },
    extraRuns: { type: Number, default: 0 },
    strikerId: { type: String, default: null },
    nonStrikerId: { type: String, default: null },
    bowlerId: { type: String, default: null },

    // Wicket info
    wicket: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    // Declare info
    declaringBatsmanId: { type: String, default: null },
    replacementBatsmanId: { type: String, default: null },

    timestamp: { type: Date, default: Date.now },
    syncedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    _id: false
  }
);

// Compound index for ordered innings replay and match queries
eventSchema.index({ matchId: 1, innings: 1, sequence: 1 });

export const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);
