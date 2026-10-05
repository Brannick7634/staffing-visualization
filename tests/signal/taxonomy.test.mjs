import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  SECTORS, ROLES, ROLE_GROUPS, TAXONOMY_NOTE, EXAMPLE_ROLES, DEFAULT_EXAMPLE,
  roleByKey, rolesForSector, sectorForRole, sectorByKey
} from '../../shared/signal/taxonomy.js'
import { parseHourlyRate } from '../../shared/signal/money.js'

const FIXTURE_PATH = fileURLToPath(new URL('../../dev-fixtures/supplied-october-2026.json', import.meta.url))

// Role keys of the five supplied national examples (fixture proposed_role_key).
const SUPPLIED_ROLE_KEYS = ['registered-nurse', 'icu-registered-nurse', 'warehouse-associate', 'forklift-operator', 'software-engineer']
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

describe('taxonomy integrity', () => {
  test('sectors: the preview sectors in order, unique slug keys', () => {
    assert.deepEqual(SECTORS.map((sector) => sector.key), ['healthcare', 'light-industrial', 'construction', 'skilled-trades', 'transportation', 'hospitality', 'it', 'professional'])
    assert.deepEqual(SECTORS.map((sector) => sector.label), ['Healthcare', 'Light Industrial', 'Construction', 'Skilled Trades', 'Transportation & Logistics', 'Hospitality', 'IT', 'Professional'])
    for (const sector of SECTORS) assert.match(sector.key, SLUG)
  })

  test('role keys are unique slugs and labels are unique', () => {
    const keys = ROLES.map((role) => role.key)
    assert.equal(new Set(keys).size, keys.length)
    const labels = ROLES.map((role) => role.label)
    assert.equal(new Set(labels).size, labels.length)
    for (const key of keys) assert.match(key, SLUG)
  })

  test('every role has the documented shape and an existing sector', () => {
    const allowed = new Set(['key', 'label', 'sectorKey', 'group', 'specialtyOf', 'kind'])
    for (const role of ROLES) {
      for (const field of Object.keys(role)) assert.ok(allowed.has(field), `${role.key}.${field}`)
      assert.equal(typeof role.label, 'string')
      assert.ok(role.label.length > 0)
      assert.equal(role.kind, 'title')
      assert.ok(sectorByKey(role.sectorKey), `${role.key} -> ${role.sectorKey}`)
    }
  })

  test('specialties point at an existing role in the same sector', () => {
    for (const role of ROLES.filter((item) => item.specialtyOf !== undefined)) {
      const parent = roleByKey(role.specialtyOf)
      assert.ok(parent, role.key)
      assert.equal(parent.sectorKey, role.sectorKey)
      assert.equal(parent.specialtyOf, undefined, 'no nested specialties')
    }
  })

  test('the five supplied benchmark roles use the fixture keys exactly', () => {
    const expected = {
      'registered-nurse': ['Registered Nurse', 'healthcare'],
      'icu-registered-nurse': ['ICU Registered Nurse', 'healthcare'],
      'warehouse-associate': ['Warehouse Associate', 'light-industrial'],
      'forklift-operator': ['Forklift Operator', 'light-industrial'],
      'software-engineer': ['Software Engineer', 'it']
    }
    for (const key of SUPPLIED_ROLE_KEYS) {
      const role = roleByKey(key)
      assert.ok(role, key)
      assert.deepEqual([role.label, role.sectorKey], expected[key])
    }
    assert.equal(roleByKey('icu-registered-nurse').specialtyOf, 'registered-nurse')
  })

  test('fixture cross-check: proposed_role_key values exist with matching labels', (t) => {
    if (!existsSync(FIXTURE_PATH)) {
      t.skip('dev-fixtures/supplied-october-2026.json not present yet; using the hardcoded supplied keys only')
      return
    }
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
    const sectorByLabel = new Map(SECTORS.map((sector) => [sector.label, sector.key]))
    const keys = fixture.national_pay_examples.map((row) => row.proposed_role_key)
    assert.deepEqual([...keys].sort(), [...SUPPLIED_ROLE_KEYS].sort())
    for (const row of fixture.national_pay_examples) {
      const role = roleByKey(row.proposed_role_key)
      assert.ok(role, row.proposed_role_key)
      assert.equal(role.label, row.role_label)
      assert.equal(role.sectorKey, sectorByLabel.get(row.proposed_sector_label))
    }
  })

  test('healthcare carries Registered Nurse first plus its nurse specialties', () => {
    const healthcare = rolesForSector('healthcare')
    assert.equal(healthcare[0].key, 'registered-nurse')
    const specialties = healthcare.filter((role) => role.specialtyOf === 'registered-nurse')
    assert.deepEqual(specialties.map((role) => role.label), [
      'Cath Lab Nurse', 'ER Nurse', 'Home Health Nurse', 'ICU Registered Nurse', 'Long-Term Care Nurse', 'Med-Surg Nurse',
      'Nurse Case Manager', 'Oncology Nurse', 'OR Nurse', 'PACU Nurse', 'Telemetry Nurse'
    ])
    assert.equal(healthcare.length, 42)
  })

  test('healthcare roles are grouped; other sectors are flat', () => {
    for (const role of ROLES) {
      if (role.sectorKey === 'healthcare') assert.ok(ROLE_GROUPS.includes(role.group), role.key)
      else assert.equal(role.group, undefined, role.key)
    }
    const groups = rolesForSector('healthcare').map((role) => role.group)
    const order = groups.filter((group, index) => groups.indexOf(group) === index)
    assert.deepEqual(order, [...ROLE_GROUPS], 'each group is contiguous and in ROLE_GROUPS order')
  })

  test('display order: alphabetical by label within a group (Registered Nurse first)', () => {
    for (const sector of SECTORS) {
      const roles = rolesForSector(sector.key).filter((role) => role.key !== 'registered-nurse')
      for (let i = 1; i < roles.length; i++) {
        if (roles[i].group !== roles[i - 1].group) continue
        assert.ok(roles[i - 1].label.localeCompare(roles[i].label, 'en') < 0, `${roles[i - 1].label} < ${roles[i].label}`)
      }
    }
  })

  test('sector role lists', () => {
    assert.deepEqual(rolesForSector('light-industrial').map((role) => role.label), [
      'Assembler / Production Worker', 'CNC Machinist', 'Forklift Operator', 'Janitor / Sanitation Worker',
      'Machine Operator', 'Packer / Packaging Operator', 'Quality Inspector', 'Warehouse Associate'
    ])
    assert.deepEqual(Object.fromEntries(SECTORS.map((sector) => [sector.key, rolesForSector(sector.key).length])), {
      healthcare: 42, 'light-industrial': 8, construction: 7, 'skilled-trades': 8, transportation: 6, hospitality: 4, it: 10, professional: 14
    })
    assert.deepEqual(rolesForSector('unknown'), [])
    assert.deepEqual(rolesForSector(undefined), [])
  })

  test('every role appears in exactly one sector list', () => {
    const listed = SECTORS.flatMap((sector) => rolesForSector(sector.key).map((role) => role.key))
    assert.deepEqual([...listed].sort(), ROLES.map((role) => role.key).sort())
  })

  test('broad posting families are not roles', () => {
    for (const family of ['Accounting/Finance', 'Administrative/Clerical', 'Marketing', 'Sales', 'Project Coordinator/Manager', 'Engineer', 'Physician/Advanced Provider', 'IT Project/Product Manager']) {
      assert.equal(ROLES.some((role) => role.label === family), false, family)
    }
    assert.match(sectorByKey('professional').familiesNote, /families, not job titles; counts not supplied/)
  })

  test('preview grouping is documented as non-canonical', () => {
    assert.match(TAXONOMY_NOTE, /not the canonical database taxonomy/)
  })
})

describe('taxonomy lookups', () => {
  test('roleByKey', () => {
    assert.equal(roleByKey('forklift-operator').label, 'Forklift Operator')
    assert.equal(roleByKey('nope'), null)
    assert.equal(roleByKey(undefined), null)
    assert.equal(roleByKey('constructor'), null)
  })

  test('sectorForRole', () => {
    assert.equal(sectorForRole('icu-registered-nurse').key, 'healthcare')
    assert.equal(sectorForRole('cnc-machinist').key, 'light-industrial')
    assert.equal(sectorForRole('software-engineer').key, 'it')
    assert.equal(sectorForRole('nope'), null)
  })

  test('sectorByKey', () => {
    assert.equal(sectorByKey('it').label, 'IT')
    assert.equal(sectorByKey('nope'), null)
  })

  test('constants are frozen', () => {
    assert.ok(Object.isFrozen(SECTORS))
    assert.ok(Object.isFrozen(ROLES))
    assert.ok(ROLES.every((role) => Object.isFrozen(role)))
    assert.ok(Object.isFrozen(EXAMPLE_ROLES))
    assert.ok(Object.isFrozen(DEFAULT_EXAMPLE))
  })
})

describe('examples', () => {
  test('EXAMPLE_ROLES are the three brief examples, all valid roles', () => {
    assert.deepEqual([...EXAMPLE_ROLES], ['icu-registered-nurse', 'software-engineer', 'warehouse-associate'])
    for (const key of EXAMPLE_ROLES) {
      assert.ok(roleByKey(key), key)
      assert.ok(SUPPLIED_ROLE_KEYS.includes(key), `${key} has a supplied national example`)
    }
  })

  test('DEFAULT_EXAMPLE is Light Industrial -> Forklift Operator -> Nationwide at $17.00', () => {
    assert.deepEqual({ ...DEFAULT_EXAMPLE }, {
      sectorKey: 'light-industrial', roleKey: 'forklift-operator', state: null, city: null, rateInput: '17.00'
    })
    assert.equal(sectorForRole(DEFAULT_EXAMPLE.roleKey).key, DEFAULT_EXAMPLE.sectorKey)
    assert.deepEqual(parseHourlyRate(DEFAULT_EXAMPLE.rateInput), { ok: true, cents: 1700 })
  })
})
