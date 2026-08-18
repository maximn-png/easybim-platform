import mongoose, { Document as MongooseDocument, Schema } from 'mongoose'

// Additive grafts onto the otherwise-static tree (window.KC_TREE, generated
// from Monday into kc-data.js). Each row is one topic a team lead approved
// from a 'new'-type Suggestion — kc-api.js grafts these onto the tree data
// the moment kc-data.js sets window.KC_TREE, before kc-app.js ever renders
// it, so an approval is visible to everyone on their next load without
// waiting for the next scripted Monday-tree regeneration.

export interface ILiveTreeNode extends MongooseDocument {
  wsKey: string
  parentPath: string[]
  name: string
  status: string
  sourceId: string
  createdByUserId: string
  createdAt: Date
  updatedAt: Date
}

const LiveTreeNodeSchema = new Schema<ILiveTreeNode>(
  {
    wsKey: { type: String, required: true, index: true },
    parentPath: { type: [String], default: [] },
    name: { type: String, required: true },
    status: { type: String, default: 'done' },
    sourceId: { type: String, required: true },
    createdByUserId: { type: String, required: true },
  },
  { timestamps: true }
)

const LiveTreeNodeModel =
  (mongoose.models.LiveTreeNode as mongoose.Model<ILiveTreeNode>) ??
  mongoose.model<ILiveTreeNode>('LiveTreeNode', LiveTreeNodeSchema)

export default LiveTreeNodeModel
