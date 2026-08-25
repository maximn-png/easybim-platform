import mongoose, { Document as MongooseDocument, Schema } from 'mongoose'

// One retrieval chunk per digested document, for the Mentor's real vector
// search (see lib/kc/embeddings.ts / lib/kc/search.ts). Kept as its own
// collection rather than embedded on Document — chunk count per document
// varies and the embedding vectors are only ever read for search, never
// alongside a normal document read.

export interface IDocumentChunk extends MongooseDocument {
  sourceDocId: string
  workspaceId: string
  title: string
  chunkIndex: number
  text: string
  anchor?: string
  embedding: number[]
  createdAt: Date
  updatedAt: Date
}

const DocumentChunkSchema = new Schema<IDocumentChunk>(
  {
    sourceDocId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true },
    title: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    anchor: String,
    embedding: { type: [Number], required: true },
  },
  { timestamps: true }
)

const DocumentChunkModel =
  (mongoose.models.DocumentChunk as mongoose.Model<IDocumentChunk>) ??
  mongoose.model<IDocumentChunk>('DocumentChunk', DocumentChunkSchema)

export default DocumentChunkModel
