import mongoose, { Schema, Document, Model } from 'mongoose'

// Small key/value store for Squirrel's dashboard settings — currently the
// office-wide timesheet-Subject → department map used by Completed Projects.
//
// Why office-wide and not EPM's per-project hoursConfig: EPM's map only has two
// teams (Model MGMT / Superposition, with מידול פתחים folded into the latter),
// and the Completed Projects card splits Modelling out as its own department. A
// per-project map also can't answer "how did Type C do" consistently — 26
// projects would each be counted by a different rule. One map, editable on the
// card, keeps every project comparable.
export interface ISquirrelSetting extends Document {
  key: string
  value: Record<string, unknown>
  updatedBy?: string | null
  updatedAt: Date
}

const SquirrelSettingSchema = new Schema<ISquirrelSetting>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
)

const SquirrelSetting: Model<ISquirrelSetting> =
  mongoose.models.SquirrelSetting ??
  mongoose.model<ISquirrelSetting>('SquirrelSetting', SquirrelSettingSchema, 'squirrel_settings')

export default SquirrelSetting
