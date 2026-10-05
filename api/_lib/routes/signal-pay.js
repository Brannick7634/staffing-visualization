// GET /api/signal/pay?role=&state=&city= (production). The visitor's pay rate
// is never a parameter. Fails closed with 503 until a verified aggregate feed
// is connected.
import { createPayHandler } from '../signal/handlers.js'
import { productionAdapter } from '../signal/productionAdapter.js'
import { sessionAccess } from '../signal/sessionAccess.js'

export default createPayHandler({ adapter: productionAdapter, resolveAccess: sessionAccess })
