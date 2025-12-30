import Airtable from 'airtable'
import bcrypt from 'bcryptjs'

// Initialize Airtable
const base = new Airtable({
  apiKey: import.meta.env.VITE_AIRTABLE_API_KEY,
}).base(import.meta.env.VITE_AIRTABLE_BASE_ID)

// Table and view configuration from environment
const COMPANY_TABLE = import.meta.env.VITE_AIRTABLE_COMPANY_TABLE || 'Company Details'
const COMPANY_VIEW_ID = import.meta.env.VITE_AIRTABLE_COMPANY_VIEW || 'Grid view'

/**
 * Fetch all firms from Airtable
 * Fields: All company details for protected dashboard
 */
export async function fetchFirms() {
  try {
    const records = await base(COMPANY_TABLE).select({
      view: COMPANY_VIEW_ID,
      fields: [
        'Company ID',
        'Industry Code',
        'Primary Segment',
        'Segments',
        'HQ State Abbr',
        'HQ location',
        'company City',
        '# EE Count',
        'Employee Size Bucket',
        'Founded',
        'Average Tenure',
        'Tenure Bucket',
        '6M Growth',
        '1Y Growth',
        '2Y Growth',
        'LinkedIn Company URL',
      'Postal Code',
      'Growth_1Y_Value'
    ],
    filterByFormula: `AND(
      {Primary Segment} != "",
      {Segments} != "",
      {HQ location} != "",
      {company City} != "",
      {Employee Size Bucket} != "",
      {Growth_1Y_Value} != "",
      {HQ State Abbr} != "",
      {Founded} != "",
      {Postal Code} != ""
    )`
  }).all()

  const allFirms = records.map((record) => ({
      id: record.id,
      companyId: record.get('Company ID') || '',
      industryCode: record.get('Industry Code') || '',
      primarySegment: record.get('Primary Segment') || '',
      segments: record.get('Segments') || '',
      hqStateAbbr: record.get('HQ State Abbr') || '',
      hqLocation: record.get('HQ location') || '',
      companyCity: record.get('company City') || '',
      eeCount: record.get('# EE Count') || 0,
      employeeSizeBucket: record.get('Employee Size Bucket') || '',
      founded: record.get('Founded') || '',
      averageTenure: record.get('Average Tenure') || 0,
      tenureBucket: record.get('Tenure Bucket') || '',
      growth6M: record.get('6M Growth') || '0%',
      growth1Y: record.get('1Y Growth') || '0%',
      growth2Y: record.get('2Y Growth') || '0%',
      linkedinUrl: record.get('LinkedIn Company URL') || '',
      postalCode: record.get('Postal Code') || '',
      growth1YValue: record.get('Growth_1Y_Value') || '',
    }))

    return allFirms
  } catch (error) {
    console.error('Error fetching firms:', error)
    return []
  }
}

/**
 * Fetch firms for protected dashboard - filtered by user's segment and/or state
 * @param {Object} user - User object with hqState and primarySegment
 * @returns {Array} Filtered firms matching user's criteria
 */
export async function fetchProtectedFirms(user) {
  try {
    // Build filter formula based on user's profile
    let baseConditions = [
      '{Primary Segment} != ""',
      '{Segments} != ""',
      '{HQ location} != ""',
      '{company City} != ""',
      '{Employee Size Bucket} != ""',
      '{Growth_1Y_Value} != ""',
      '{HQ State Abbr} != ""',
      '{Founded} != ""',
      '{Postal Code} != ""'
    ]

    // Only filter by segment in API, NOT by state
    // The state filtering will happen client-side for the heatmap
    if (user?.primarySegment) {
      // Match PRIMARY segment field exactly (case-sensitive, trim whitespace)
      const cleanSegment = String(user.primarySegment).trim()
      baseConditions.push(`{Primary Segment} = "${cleanSegment}"`)
    }

    const filterFormula = `AND(${baseConditions.join(', ')})`


    const records = await base(COMPANY_TABLE).select({
      view: COMPANY_VIEW_ID,
      fields: [
        'Company ID',
        'Industry Code',
        'Primary Segment',
        'Segments',
        'HQ State Abbr',
        'HQ location',
        'company City',
        '# EE Count',
        'Employee Size Bucket',
        'Founded',
        'Average Tenure',
        'Tenure Bucket',
        '6M Growth',
        '1Y Growth',
        '2Y Growth',
        'LinkedIn Company URL',
        'Postal Code',
        'Growth_1Y_Value'
      ],
      filterByFormula: filterFormula
    }).all()


    const firms = records.map((record) => ({
      id: record.id,
      companyId: record.get('Company ID') || '',
      industryCode: record.get('Industry Code') || '',
      primarySegment: record.get('Primary Segment') || '',
      segments: record.get('Segments') || '',
      hqStateAbbr: record.get('HQ State Abbr') || '',
      hqLocation: record.get('HQ location') || '',
      companyCity: record.get('company City') || '',
      eeCount: record.get('# EE Count') || 0,
      employeeSizeBucket: record.get('Employee Size Bucket') || '',
      founded: record.get('Founded') || '',
      averageTenure: record.get('Average Tenure') || 0,
      tenureBucket: record.get('Tenure Bucket') || '',
      growth6M: record.get('6M Growth') || '0%',
      growth1Y: record.get('1Y Growth') || '0%',
      growth2Y: record.get('2Y Growth') || '0%',
      linkedinUrl: record.get('LinkedIn Company URL') || '',
      postalCode: record.get('Postal Code') || '',
      growth1YValue: record.get('Growth_1Y_Value') || '',
    }))

    return firms
  } catch (error) {
    console.error('Error fetching protected firms:', error)
    return []
  }
}

/**
 * Submit lead request to Airtable Staffing Signal Staffing Signal Leads Table (Test)
 */
export async function submitLeadRequest(formData) {
  try {
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(formData.password, 10)
    
    const record = await base('Staffing Signal Leads Table (Test)').create([
      {
        fields: {
          'First Name': formData.firstName,
          'Email': formData.email,
          'Password': hashedPassword,
          'Employee Band Size': formData.employeeBandSize,
          'HQ State': formData.hqState,
          'Primary Segment': formData.primarySegment,
        },
      },
    ])
    return { success: true, record }
  } catch (error) {
    console.error('Error submitting lead request:', error)
    return { success: false, error }
  }
}

/**
 * Verify user credentials from Airtable
 */
export async function verifyCredentials(email, password) {
  try {
    const records = await base('Staffing Signal Leads Table (Test)').select({
      filterByFormula: `{Email} = '${email}'`,
      maxRecords: 1
    }).firstPage()

    if (records.length === 0) {
      return { success: false, error: 'User not found' }
    }

    const user = records[0]
    const storedHashedPassword = user.get('Password')

    // Compare the provided password with the hashed password
    const passwordMatch = await bcrypt.compare(password, storedHashedPassword)

    if (passwordMatch) {
      return {
        success: true,
        user: {
          id: user.id,
          firstName: user.get('First Name'),
          email: user.get('Email'),
          employeeBandSize: user.get('Employee Band Size'),
          hqState: user.get('HQ State'),
          primarySegment: user.get('Primary Segment')
        }
      }
    } else {
      return { success: false, error: 'Invalid password' }
    }
  } catch (error) {
    console.error('Error verifying credentials:', error)
    return { success: false, error: 'Authentication failed' }
  }
}

// Check if Airtable is configured
export function isAirtableConfigured() {
  return !!(
    import.meta.env.VITE_AIRTABLE_API_KEY &&
    import.meta.env.VITE_AIRTABLE_BASE_ID
  )
}

// Get the configured view ID
export function getViewId() {
  return COMPANY_VIEW_ID
}
