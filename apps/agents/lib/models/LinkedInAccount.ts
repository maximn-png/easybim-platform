import mongoose, { Schema, Document, Model } from 'mongoose'

// The connected LinkedIn organization (EasyBIM's company page). One document —
// `key` is fixed so connecting twice replaces rather than accumulates.
//
// Tokens are stored AES-256-GCM encrypted (lib/utils/encryption.ts) and are only
// ever decrypted server-side in the LinkedIn client; nothing here is sent to the
// browser except the non-secret display fields.
export interface ILinkedInAccount extends Document {
  key: string // always 'peacock'
  organizationUrn: string // e.g. "urn:li:organization:1234567"
  organizationName?: string
  accessTokenEnc: string
  refreshTokenEnc?: string
  expiresAt?: Date
  scope?: string
  connectedBy?: string // Clerk userId
  lastSyncAt?: Date
  lastSyncError?: string
  createdAt: Date
  updatedAt: Date
}

const LinkedInAccountSchema = new Schema<ILinkedInAccount>(
  {
    key: { type: String, required: true, unique: true, default: 'peacock' },
    organizationUrn: { type: String, required: true },
    organizationName: String,
    accessTokenEnc: { type: String, required: true },
    refreshTokenEnc: String,
    expiresAt: Date,
    scope: String,
    connectedBy: String,
    lastSyncAt: Date,
    lastSyncError: String,
  },
  { timestamps: true }
)

const LinkedInAccount: Model<ILinkedInAccount> =
  mongoose.models.LinkedInAccount ??
  mongoose.model<ILinkedInAccount>('LinkedInAccount', LinkedInAccountSchema, 'peacock_linkedin_account')

export default LinkedInAccount
