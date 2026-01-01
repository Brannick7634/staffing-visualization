// Segment mapping: UI display name -> Airtable value
export const SEGMENT_MAPPING = {
  'Admin': 'admin',
  'Agriculture': 'agriculture',
  'Construction': 'construction',
  'Energy': 'energy',
  'EOR': 'EOR',
  'Executive Recruiting': 'executive recruiting',
  'Healthcare': 'healthcare',
  'IT': 'IT',
  'Light Industrial': 'light industrial',
  'MGF': 'Mgf',
  'PEO': 'PEO',
  'Professional': 'professional',
  'Skilled': 'skilled',
  'Technical': 'technical',
  'Transportation': 'transportation',
  'USLH': 'USLH'
}

// Reverse mapping: Airtable value -> UI display name
export const SEGMENT_REVERSE_MAPPING = Object.entries(SEGMENT_MAPPING).reduce((acc, [key, value]) => {
  acc[value.toLowerCase()] = key
  return acc
}, {})

// Get all segment display names
export const SEGMENT_NAMES = Object.keys(SEGMENT_MAPPING)

// Get all Airtable segment values
export const SEGMENT_VALUES = Object.values(SEGMENT_MAPPING)

// Normalize segment name for comparison (case-insensitive)
export const normalizeSegment = (segment) => {
  if (!segment) return ''
  const normalized = String(segment).trim()
  const lower = normalized.toLowerCase()
  
  // Check if it matches an Airtable value, return display name
  if (SEGMENT_REVERSE_MAPPING[lower]) {
    return SEGMENT_REVERSE_MAPPING[lower]
  }
  
  // Check if it matches a display name
  const matchingKey = SEGMENT_NAMES.find(key => key.toLowerCase() === lower)
  if (matchingKey) {
    return matchingKey
  }
  
  // Return original if no match
  return normalized
}

// Check if a firm's segments include a specific segment (case-insensitive)
export const firmHasSegment = (firm, targetSegment) => {
  if (!firm || !targetSegment) return false
  
  const segments = firm.segments || firm.primarySegment || ''
  
  // Handle both string and array types
  let segmentList = []
  if (typeof segments === 'string') {
    segmentList = segments.split(',').map(s => s.trim())
  } else if (Array.isArray(segments)) {
    segmentList = segments.map(s => String(s).trim())
  }
  
  // Normalize target segment
  const normalizedTarget = normalizeSegment(targetSegment)
  
  // Check if any segment matches
  return segmentList.some(seg => {
    const normalizedSeg = normalizeSegment(seg)
    return normalizedSeg.toLowerCase() === normalizedTarget.toLowerCase()
  })
}

// Check if a firm's PRIMARY segment matches the target segment (case-insensitive)
export const firmHasPrimarySegment = (firm, targetSegment) => {
  if (!firm || !targetSegment) return false
  
  const primarySegment = firm.primarySegment || ''
  if (!primarySegment) return false
  
  // Normalize both segments
  const normalizedPrimary = normalizeSegment(primarySegment)
  const normalizedTarget = normalizeSegment(targetSegment)
  
  return normalizedPrimary.toLowerCase() === normalizedTarget.toLowerCase()
}
