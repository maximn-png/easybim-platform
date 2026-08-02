import mongoose, { Document, Schema } from 'mongoose'

// A user's Autodesk (APS) refresh token, persisted so background jobs can act on
// their behalf. Interactive requests still read the httpOnly cookies — this row
// exists for the cases with no browser attached, i.e. scheduled reports.
//
// One row per (user, hub): Autodesk scopes hub access to the APP the token was
// issued through, so a partner hub like ANA needs its own token (hubKey = the
// ApsHub key; the EasyBIM app uses the empty string).

export interface IApsToken extends Document {
  userId:       string   // Clerk user id
  hubKey:       string   // '' = EasyBIM app, otherwise the partner hub key
  refreshToken: string   // sealed by lib/server/secretBox when a key is configured
  enc:          boolean
  createdAt:    Date
  updatedAt:    Date
}

const ApsTokenSchema = new Schema<IApsToken>(
  {
    userId:       { type: String, required: true, index: true },
    hubKey:       { type: String, default: '' },
    refreshToken: { type: String, required: true },
    enc:          { type: Boolean, default: false },
  },
  { timestamps: true }
)

ApsTokenSchema.index({ userId: 1, hubKey: 1 }, { unique: true })

const ApsToken =
  (mongoose.models.ApsToken as mongoose.Model<IApsToken>) ??
  mongoose.model<IApsToken>('ApsToken', ApsTokenSchema)

export default ApsToken
