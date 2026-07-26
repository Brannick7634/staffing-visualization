// TEMPORARY diagnostic endpoint — delete once the 0-firms issue is root-caused.
import Airtable from 'airtable'

export default async function handler(req, res) {
  try {
    const hasKey = !!process.env.AIRTABLE_API_KEY
    const hasBase = !!process.env.AIRTABLE_BASE_ID
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID)
    const table = process.env.AIRTABLE_COMPANY_TABLE || 'Company Details'
    const view = process.env.AIRTABLE_COMPANY_VIEW || 'Grid view'

    const records = await base(table).select({ view, maxRecords: 3 }).firstPage()

    res.status(200).json({
      hasKey, hasBase, table, view,
      recordCount: records.length,
      sample: records[0]?.fields || null,
    })
  } catch (error) {
    res.status(500).json({
      hasKey: !!process.env.AIRTABLE_API_KEY,
      hasBase: !!process.env.AIRTABLE_BASE_ID,
      table: process.env.AIRTABLE_COMPANY_TABLE,
      view: process.env.AIRTABLE_COMPANY_VIEW,
      errorMessage: error.message,
      errorStatusCode: error.statusCode,
    })
  }
}
