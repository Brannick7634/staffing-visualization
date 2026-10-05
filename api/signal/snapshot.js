// GET /api/signal/snapshot (production). Fails closed with 503 until a
// verified aggregate feed is connected.
import { createSnapshotHandler } from '../_lib/signal/handlers.js'
import { productionAdapter } from '../_lib/signal/productionAdapter.js'
import { sessionAccess } from '../_lib/signal/sessionAccess.js'

export default createSnapshotHandler({ adapter: productionAdapter, resolveAccess: sessionAccess })
