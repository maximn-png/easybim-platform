import mongoose, { Schema, Document, Model } from 'mongoose'

// Per-project marketing flags Maxim toggles on the Project Status page.
// Project data itself lives in the EPM app (easybim-epm.projects); this store
// only holds the manual yes/no flags, keyed by project number.
export interface IProjectFlag extends Document {
  projectNumber: string
  publishedToLinkedIn: boolean
  inPortfolio: boolean
  updatedBy?: string
  createdAt: Date
  updatedAt: Date
}

const ProjectFlagSchema = new Schema<IProjectFlag>(
  {
    projectNumber: { type: String, required: true, unique: true },
    publishedToLinkedIn: { type: Boolean, default: false },
    inPortfolio: { type: Boolean, default: false },
    updatedBy: String,
  },
  { timestamps: true }
)

const ProjectFlag: Model<IProjectFlag> =
  mongoose.models.ProjectFlag ??
  mongoose.model<IProjectFlag>('ProjectFlag', ProjectFlagSchema, 'peacock_project_flags')

export default ProjectFlag
