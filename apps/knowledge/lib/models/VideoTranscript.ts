import mongoose, { Document as MongooseDocument, Schema } from 'mongoose'

// A generated transcript for one Revit "Videos"-group video (see
// scripts/digestRevitVideoTranscripts.ts) — the Drive file has no captions of
// its own, so this is Gemini's speech-to-text pass over the video, plus a
// full EN/HE translation of that transcript. No per-segment timestamps: the
// Drive embed (kc-app.js's openVideoPage, `/file/d/<id>/preview`) exposes no
// playback-time API, so a synced/scrubbing caption track isn't buildable
// against it — this is deliberately just one static block per language.

export type VideoTranscriptStatus = 'ready' | 'error'

export interface IVideoTranscript extends MongooseDocument {
  driveId: string
  status: VideoTranscriptStatus
  errorMessage?: string
  language: string // the spoken language Gemini detected, e.g. 'he' | 'en' | 'mixed'
  textOriginal: string // transcript as spoken, untranslated
  textEn: string
  textHe: string
  createdAt: Date
  updatedAt: Date
}

const VideoTranscriptSchema = new Schema<IVideoTranscript>(
  {
    driveId: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['ready', 'error'], required: true, default: 'error' },
    errorMessage: String,
    language: { type: String, default: '' },
    textOriginal: { type: String, default: '' },
    textEn: { type: String, default: '' },
    textHe: { type: String, default: '' },
  },
  { timestamps: true }
)

const VideoTranscriptModel =
  (mongoose.models.VideoTranscript as mongoose.Model<IVideoTranscript>) ??
  mongoose.model<IVideoTranscript>('VideoTranscript', VideoTranscriptSchema)

export default VideoTranscriptModel
