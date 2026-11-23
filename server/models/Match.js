import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // Client UUID
    team1: {
      name: { type: String, required: true },
      playerIds: [{ type: String }],
      players: [
        {
          _id: String,
          name: String,
          role: String,
          isGuest: Number
        }
      ]
    },
    team2: {
      name: { type: String, required: true },
      playerIds: [{ type: String }],
      players: [
        {
          _id: String,
          name: String,
          role: String,
          isGuest: Number
        }
      ]
    },
    rules: {
      wide: {
        runs: { type: Number, default: 1 },
        reBowled: { type: Boolean, default: true }
      },
      noBall: {
        runs: { type: Number, default: 1 },
        reBowled: { type: Boolean, default: true },
        freeHit: { type: Boolean, default: false }
      },
      byes: { type: Boolean, default: false },
      legByes: { type: Boolean, default: false },
      lastManBatsAlone: { type: Boolean, default: true },
      oversPerInnings: { type: Number, default: 5 },
      playersPerSide: { type: Number, default: 11 }
    },
    battingFirstTeamKey: {
      type: String,
      enum: ['team1', 'team2'],
      default: 'team1'
    },
    status: {
      type: String,
      enum: ['setup', 'innings1', 'innings2', 'completed', 'abandoned'],
      default: 'setup'
    },
    openers: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    syncedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    _id: false
  }
);

export const Match = mongoose.models.Match || mongoose.model('Match', matchSchema);
