import mongoose, { Document as MongooseDocument, Schema } from 'mongoose'

// The live, ongoing mirror of Monday's "Revit" > "Docs" group — kept in
// sync by the daily cron (app/api/cron/sync-tree) via lib/kc/mondaySync.ts.
// Supersedes kc-data.js's baked-in "Docs" array for that one section: a
// deployed app can't rewrite its own static public/ files at runtime (read-
// only filesystem), so keeping the tree live means storing the current
// desired state here and grafting it onto window.KC_TREE client-side (see
// /api/kc/tree-overlay's replaceSections, and kc-api.js's graftTreeOverlay)
// instead of regenerating the file. One row per Monday item, so adds,
// renames, and removals of items in Monday are all just "this collection's
// current contents" — no separate diff bookkeeping needed.

export interface IMondayTreeItem extends MongooseDocument {
  mondayItemId: string
  wsKey: string
  parentPath: string[]
  name: string
  sourceId?: string
  status: string
  createdAt: Date
  updatedAt: Date
}

const MondayTreeItemSchema = new Schema<IMondayTreeItem>(
  {
    mondayItemId: { type: String, required: true, unique: true, index: true },
    wsKey: { type: String, required: true },
    parentPath: { type: [String], default: [] },
    name: { type: String, required: true },
    sourceId: String,
    status: { type: String, default: 'todo' },
  },
  { timestamps: true }
)

const MondayTreeItemModel =
  (mongoose.models.MondayTreeItem as mongoose.Model<IMondayTreeItem>) ??
  mongoose.model<IMondayTreeItem>('MondayTreeItem', MondayTreeItemSchema)

export default MondayTreeItemModel
