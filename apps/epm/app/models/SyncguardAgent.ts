import mongoose, { Schema } from 'mongoose'

// One document per workstation that can run Syncguard jobs (docs/SYNCGUARD_PLAN.md).
//
// The agent only ever makes OUTBOUND calls (enroll, heartbeat, claim, log,
// complete), so no inbound ports or VPN are needed and the row is the only
// place the platform learns anything about the machine.
//
// Two kinds, and the difference is whose Autodesk licence gets used — licensing
// follows the target machine's Windows session, never the browser click:
//   personal — the requester's own machine. No bot account needed, and ACC
//              attributes the sync to a real person. Default for Run Now.
//   shared   — an always-on workstation (e.g. EB-WS-07). The only kind a
//              SCHEDULED run can target, since a personal laptop may be asleep.
//
// Enrollment is a pairing handshake, so a token never travels through a form:
// the UI creates a row with a short `pairingCode` (enrolled = false), the agent
// on the machine exchanges that code once for a bearer token, and only the
// token's SHA-256 is kept here.
export interface ISyncguardAgent {
  agentId: string              // uuid the agent generates at install
  machineName: string          // 'EB-WS-07' — hostname, shown in the picker
  kind: 'personal' | 'shared'
  ownerUserId: string          // Clerk userId who enrolled it → drives "my computer"

  enrolled: boolean            // false while waiting for the agent to redeem the code
  pairingCode?: string         // short, single-use
  pairingExpiresAt?: Date
  tokenHash?: string           // sha256 of the bearer token; the token itself is never stored

  // Reported every heartbeat. `autodeskSignedIn` matters as much as being
  // online: an expired Autodesk session makes the next Revit launch hang on a
  // sign-in prompt, so the UI must warn BEFORE a scheduled window, not fail in it.
  revitVersions: string[]
  autodeskSignedIn: boolean
  autodeskUser?: string
  revitRunning: boolean        // a human may be using Revit right now
  openModels: string[]         // model names open in that Revit — powers the "close it first" refusal
  agentVersion?: string

  currentRunId?: mongoose.Types.ObjectId | null
  lastHeartbeatAt?: Date
  enabled: boolean             // admin kill switch, independent of being online

  createdAt: Date
  updatedAt: Date
}

const SyncguardAgentSchema = new Schema<ISyncguardAgent>(
  {
    agentId:          { type: String, required: true, unique: true },
    machineName:      { type: String, default: '' },
    kind:             { type: String, enum: ['personal', 'shared'], required: true },
    ownerUserId:      { type: String, required: true, index: true },

    enrolled:         { type: Boolean, default: false },
    pairingCode:      { type: String },
    pairingExpiresAt: { type: Date },
    tokenHash:        { type: String },

    revitVersions:    { type: [String], default: [] },
    autodeskSignedIn: { type: Boolean, default: false },
    autodeskUser:     { type: String },
    revitRunning:     { type: Boolean, default: false },
    openModels:       { type: [String], default: [] },
    agentVersion:     { type: String },

    currentRunId:     { type: Schema.Types.ObjectId, ref: 'SyncguardRun', default: null },
    lastHeartbeatAt:  { type: Date },
    enabled:          { type: Boolean, default: true },
  },
  { timestamps: true }
)

// Sparse: only unredeemed rows carry a code, and two agents must never share one.
SyncguardAgentSchema.index({ pairingCode: 1 }, { unique: true, sparse: true })
SyncguardAgentSchema.index({ tokenHash: 1 }, { sparse: true })
SyncguardAgentSchema.index({ enrolled: 1, kind: 1 })

const SyncguardAgent =
  (mongoose.models.SyncguardAgent as mongoose.Model<ISyncguardAgent>) ??
  mongoose.model<ISyncguardAgent>('SyncguardAgent', SyncguardAgentSchema, 'epm_syncguard_agents')

export default SyncguardAgent
