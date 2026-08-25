import mongoose, { Document as MongooseDocument, Schema } from 'mongoose'

// A real, per-user in-app inbox — the honest replacement for toasts that
// used to claim "author notified" with no notification mechanism behind
// them at all (kc-teamlead.js's doReject). No email yet; see kc-send.js's
// send-document mock for that separate, not-yet-built piece.

export interface INotification extends MongooseDocument {
  userId: string
  message: string
  read: boolean
  createdAt: Date
  updatedAt: Date
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: String, required: true, index: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
)

NotificationSchema.index({ userId: 1, createdAt: -1 })

const NotificationModel =
  (mongoose.models.Notification as mongoose.Model<INotification>) ??
  mongoose.model<INotification>('Notification', NotificationSchema)

export default NotificationModel
