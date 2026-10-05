// Preview grouping of sectors and job titles for The Staffing Signal preview.
//
// This is a PREVIEW grouping, not the canonical database taxonomy. Role keys
// for the five roles with supplied national examples match the supplied
// fixture's proposed_role_key values exactly. Which roles actually have a
// benchmark is data, so it comes from the API (snapshot.nationalPay), not from
// this file. Broad posting families (e.g. Accounting/Finance) are NOT roles.
//
// Browser-safe (no node: imports).

export const TAXONOMY_NOTE = 'Preview grouping, not the canonical database taxonomy.'

function freezeAll(items) {
  return Object.freeze(items.map((item) => Object.freeze(item)))
}

export const SECTORS = freezeAll([
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'light-industrial', label: 'Light Industrial' },
  { key: 'construction', label: 'Construction' },
  { key: 'skilled-trades', label: 'Skilled Trades' },
  { key: 'transportation', label: 'Transportation & Logistics' },
  { key: 'hospitality', label: 'Hospitality' },
  { key: 'it', label: 'IT' },
  {
    key: 'professional',
    label: 'Professional',
    familiesNote: 'Broad posting families observed include Accounting/Finance, Administrative/Clerical, Marketing, Sales and Project Coordinator/Manager (families, not job titles; counts not supplied).'
  }
])

const RN = 'registered-nurse'

// Each role: { key, label, sectorKey, specialtyOf?, kind:'title' }.
// Nurse specialties are explicit roles; an ICU role is never inferred from a
// generic Registered Nurse posting.
export const ROLES = freezeAll([
  { key: RN, label: 'Registered Nurse', sectorKey: 'healthcare', kind: 'title' },
  { key: 'icu-registered-nurse', label: 'ICU Registered Nurse', sectorKey: 'healthcare', specialtyOf: RN, kind: 'title' },
  { key: 'or-nurse', label: 'OR Nurse', sectorKey: 'healthcare', specialtyOf: RN, kind: 'title' },
  { key: 'er-nurse', label: 'ER Nurse', sectorKey: 'healthcare', specialtyOf: RN, kind: 'title' },
  { key: 'med-surg-nurse', label: 'Med-Surg Nurse', sectorKey: 'healthcare', specialtyOf: RN, kind: 'title' },
  { key: 'telemetry-nurse', label: 'Telemetry Nurse', sectorKey: 'healthcare', specialtyOf: RN, kind: 'title' },
  { key: 'labor-delivery-nurse', label: 'Labor & Delivery Nurse', sectorKey: 'healthcare', specialtyOf: RN, kind: 'title' },
  { key: 'home-health-nurse', label: 'Home Health Nurse', sectorKey: 'healthcare', specialtyOf: RN, kind: 'title' },
  { key: 'warehouse-associate', label: 'Warehouse Associate', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'forklift-operator', label: 'Forklift Operator', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'cnc-machinist', label: 'CNC Machinist', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'general-laborer', label: 'General Laborer', sectorKey: 'construction', kind: 'title' },
  { key: 'carpenter', label: 'Carpenter', sectorKey: 'construction', kind: 'title' },
  { key: 'heavy-equipment-operator', label: 'Heavy Equipment Operator', sectorKey: 'construction', kind: 'title' },
  { key: 'concrete-finisher', label: 'Concrete Finisher', sectorKey: 'construction', kind: 'title' },
  { key: 'roofer', label: 'Roofer', sectorKey: 'construction', kind: 'title' },
  { key: 'construction-superintendent', label: 'Construction Superintendent', sectorKey: 'construction', kind: 'title' },
  { key: 'electrician', label: 'Electrician', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'welder', label: 'Welder', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'plumber', label: 'Plumber', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'hvac-technician', label: 'HVAC Technician', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'maintenance-technician', label: 'Maintenance Technician', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'industrial-mechanic', label: 'Industrial Mechanic', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'cdl-class-a-driver', label: 'CDL Class A Driver', sectorKey: 'transportation', kind: 'title' },
  { key: 'delivery-driver', label: 'Delivery Driver', sectorKey: 'transportation', kind: 'title' },
  { key: 'dispatcher', label: 'Dispatcher', sectorKey: 'transportation', kind: 'title' },
  { key: 'diesel-mechanic', label: 'Diesel Mechanic', sectorKey: 'transportation', kind: 'title' },
  { key: 'line-cook', label: 'Line Cook', sectorKey: 'hospitality', kind: 'title' },
  { key: 'server', label: 'Server', sectorKey: 'hospitality', kind: 'title' },
  { key: 'housekeeper', label: 'Housekeeper', sectorKey: 'hospitality', kind: 'title' },
  { key: 'banquet-staff', label: 'Banquet Staff', sectorKey: 'hospitality', kind: 'title' },
  { key: 'software-engineer', label: 'Software Engineer', sectorKey: 'it', kind: 'title' }
])

const SECTOR_INDEX = new Map(SECTORS.map((sector) => [sector.key, sector]))
const ROLE_INDEX = new Map(ROLES.map((role) => [role.key, role]))

export function sectorByKey(sectorKey) {
  return SECTOR_INDEX.get(sectorKey) || null
}

export function roleByKey(roleKey) {
  return ROLE_INDEX.get(roleKey) || null
}

// Roles in a sector, in display order. Unknown sector -> [].
export function rolesForSector(sectorKey) {
  return ROLES.filter((role) => role.sectorKey === sectorKey)
}

// The sector object a role belongs to, or null for an unknown role.
export function sectorForRole(roleKey) {
  const role = roleByKey(roleKey)
  return role ? sectorByKey(role.sectorKey) : null
}

export const EXAMPLE_ROLES = Object.freeze(['icu-registered-nurse', 'software-engineer', 'warehouse-associate'])

export const DEFAULT_EXAMPLE = Object.freeze({
  sectorKey: 'light-industrial',
  roleKey: 'forklift-operator',
  state: null,
  city: null,
  rateInput: '17.00'
})
