import mongoose, { Schema, Document, Model } from 'mongoose'

// Small key/value store for Peacock's dashboard settings — currently just the
// content plan (weekly cadence + which pillars are in play).
//
// Same shape as SquirrelSetting rather than a typed one-off document: these are
// dashboard preferences, not domain records, and one collection per agent keeps
// them from colliding while staying cheap to add to.
//
// This exists because the Content Plan card used to be decorative. Its stepper
// and pillar chips were React state and nothing else read them, so the weekly
// author cron kept drafting the 2 posts hardcoded in its prompt no matter what
// the card said. Persisting the plan is what lets the card actually govern.
export interface IPeacockSetting extends Document {
  key: string
  value: Record<string, unknown>
  updatedBy?: string | null
  updatedAt: Date
}

const PeacockSettingSchema = new Schema<IPeacockSetting>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
)

const PeacockSetting: Model<IPeacockSetting> =
  mongoose.models.PeacockSetting ??
  mongoose.model<IPeacockSetting>('PeacockSetting', PeacockSettingSchema, 'peacock_settings')

export default PeacockSetting
