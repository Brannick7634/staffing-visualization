// GET /api/signal/snapshot (production). Fails closed with 503 until a
// verified aggregate feed is connected.
import { createSnapshotHandler } from '../signal/handlers.js'
import { productionAdapter } from '../signal/productionAdapter.js'
import { sessionAccess } from '../signal/sessionAccess.js'

export default createSnapshotHandler({ adapter: productionAdapter, resolveAccess: sessionAccess })
