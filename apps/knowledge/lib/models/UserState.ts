import mongoose, { Document as MongooseDocument, Schema } from 'mongoose'

// Per-Clerk-user personal state for the Knowledge Center: custom files/tree,
// Notebook notes, bookmarks, mentor chat history, dictionary/translation
// preferences. One document per user, a flat key->value blob mirroring what
// kc-api.js previously kept in localStorage (see kc-api.js's RemoteKV) — kept
// intentionally schema-less per key since the shapes already live in kc-api.js.

export interface IUserState extends MongooseDocument {
  userId: string
  kv: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

const UserStateSchema = new Schema<IUserState>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    kv: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

const UserStateModel =
  (mongoose.models.UserState as mongoose.Model<IUserState>) ??
  mongoose.model<IUserState>('UserState', UserStateSchema)

export default UserStateModel
