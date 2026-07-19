/**
 * Unit test: verify all event fields survive the cloud sync round-trip.
 * Tests mapLocalEventToCloudPayload → payload → mapCloudEventToLocalEvent.
 * Does not require Supabase — tests the mapper functions directly.
 */

// Inline the mapper logic from cloudSync.js for direct testing
function mapLocalEventToCloudPayload(localEvent, userId) {
  const seated = Object.keys(localEvent.seating ?? {}).length;
  const total  = (localEvent.guests ?? []).length;
  const seatedPct = total > 0 ? parseFloat(((seated / total) * 100).toFixed(2)) : 0;

  return {
    user_id:     userId,
    name:        localEvent.name        ?? "",
    type:        localEvent.type        ?? "חתונה",
    date:        localEvent.date        || null,
    venue:       localEvent.venue       || null,
    guest_count: total,
    table_count: (localEvent.tables ?? []).length,
    seated_pct:  seatedPct,
    version:     localEvent.version     ?? 1,
    updated_at:  new Date(localEvent.updatedAt ?? Date.now()).toISOString(),
    payload: {
      localId:          localEvent.id,
      tables:           localEvent.tables           ?? [],
      guests:           localEvent.guests           ?? [],
      seating:          localEvent.seating          ?? {},
      constraints:      localEvent.constraints      ?? [],
      brideName:        localEvent.brideName        ?? "",
      groomName:        localEvent.groomName        ?? "",
      celebrantName:    localEvent.celebrantName    ?? "",
      organizationName: localEvent.organizationName ?? "",
      contactName:      localEvent.contactName      ?? "",
      ownerName:        localEvent.ownerName        ?? "",
      customGroups:     Array.isArray(localEvent.customGroups) ? localEvent.customGroups : [],
      createdAt:        localEvent.createdAt        ?? Date.now(),
      updatedAt:        localEvent.updatedAt        ?? Date.now(),
      version:          localEvent.version          ?? 1,
      lockedGuests:     Array.isArray(localEvent.lockedGuests) ? localEvent.lockedGuests : [],
      lockedTables:     Array.isArray(localEvent.lockedTables) ? localEvent.lockedTables : [],
    },
  };
}

function mapCloudEventToLocalEvent(cloudRow) {
  const p = cloudRow.payload ?? {};
  return {
    id:               p.localId      ?? cloudRow.id,
    name:             cloudRow.name  ?? "",
    type:             cloudRow.type  ?? "חתונה",
    date:             cloudRow.date  ?? "",
    venue:            cloudRow.venue ?? "",
    brideName:        p.brideName        ?? "",
    groomName:        p.groomName        ?? "",
    celebrantName:    p.celebrantName    ?? "",
    organizationName: p.organizationName ?? "",
    contactName:      p.contactName      ?? "",
    ownerName:        p.ownerName        ?? "",
    customGroups:     Array.isArray(p.customGroups) ? p.customGroups : [],
    tables:           Array.isArray(p.tables)        ? p.tables       : [],
    guests:           Array.isArray(p.guests)        ? p.guests       : [],
    seating:          (p.seating && typeof p.seating === "object") ? p.seating : {},
    constraints:      Array.isArray(p.constraints)   ? p.constraints  : [],
    createdAt:        p.createdAt ?? new Date(cloudRow.created_at).getTime(),
    updatedAt:        p.updatedAt ?? new Date(cloudRow.updated_at).getTime(),
    version:          cloudRow.version ?? p.version ?? 1,
    cloudId:          cloudRow.id,
    lockedGuests:     Array.isArray(p.lockedGuests) ? p.lockedGuests : [],
    lockedTables:     Array.isArray(p.lockedTables) ? p.lockedTables : [],
  };
}

// ── Simulate cloud round-trip ─────────────────────────────────────────────────
// local → payload → (simulate db store/fetch) → reconstruct cloud row → local
function roundTrip(localEvent) {
  const payload = mapLocalEventToCloudPayload(localEvent, 'user-uuid-123');
  // Simulate what Supabase stores and returns as a cloud row
  const cloudRow = {
    id:         'cloud-uuid-abc',
    name:       payload.name,
    type:       payload.type,
    date:       payload.date,
    venue:      payload.venue,
    version:    payload.version,
    created_at: new Date().toISOString(),
    updated_at: payload.updated_at,
    payload:    payload.payload,
  };
  return mapCloudEventToLocalEvent(cloudRow);
}

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`✓ ${label}`); pass++; }
  else     { console.log(`✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); fail++; }
}

// ── Test 1: Bar Mitzvah event with celebrantName ──────────────────────────────
{
  const barMitzvah = {
    id: 'bm-001', name: 'בר המצווה של עידו', type: 'בר מצווה',
    date: '2026-09-15', venue: 'אולם כוכב',
    brideName: '', groomName: '',
    celebrantName: 'עידו כהן',
    organizationName: '', contactName: '', ownerName: '',
    customGroups: [],
    tables: [{ id: 't1', name: 'שולחן 1', capacity: 10, type: 'regular' }],
    guests: [{ id: 'g1', name: 'דני לוי', side: 'bride', count: 1 }],
    seating: { 'g1': 't1' },
    constraints: [],
    createdAt: 1000, updatedAt: 2000, version: 2,
    lockedGuests: ['g1'], lockedTables: [],
  };
  const result = roundTrip(barMitzvah);
  check('Bar Mitzvah: celebrantName preserved', result.celebrantName, 'עידו כהן');
  check('Bar Mitzvah: name preserved', result.name, 'בר המצווה של עידו');
  check('Bar Mitzvah: type preserved', result.type, 'בר מצווה');
  check('Bar Mitzvah: guests preserved', result.guests, barMitzvah.guests);
  check('Bar Mitzvah: seating preserved', result.seating, barMitzvah.seating);
  check('Bar Mitzvah: lockedGuests preserved', result.lockedGuests, ['g1']);
  check('Bar Mitzvah: cloudId set', result.cloudId, 'cloud-uuid-abc');
  check('Bar Mitzvah: local id preserved', result.id, 'bm-001');
}

// ── Test 2: Business event with organizationName + contactName ────────────────
{
  const business = {
    id: 'biz-002', name: 'כנס שנתי 2026', type: 'אירוע עסקי',
    date: '2026-11-01', venue: 'מרכז הכנסים',
    brideName: '', groomName: '', celebrantName: '', ownerName: '',
    organizationName: 'חברת כוכב בע"מ',
    contactName: 'יוסי כהן',
    customGroups: ['VIP', 'דוברים'],
    tables: [], guests: [], seating: {}, constraints: [],
    createdAt: 3000, updatedAt: 4000, version: 1,
    lockedGuests: [], lockedTables: ['t5'],
  };
  const result = roundTrip(business);
  check('Business: organizationName preserved', result.organizationName, 'חברת כוכב בע"מ');
  check('Business: contactName preserved', result.contactName, 'יוסי כהן');
  check('Business: customGroups preserved', result.customGroups, ['VIP', 'דוברים']);
  check('Business: lockedTables preserved', result.lockedTables, ['t5']);
  check('Business: type preserved', result.type, 'אירוע עסקי');
}

// ── Test 3: Family event with ownerName ───────────────────────────────────────
{
  const family = {
    id: 'fam-003', name: 'חגיגת יובל', type: 'אירוע משפחתי',
    date: '2026-12-25', venue: '',
    brideName: '', groomName: '', celebrantName: '', organizationName: '', contactName: '',
    ownerName: 'משפחת לוי',
    customGroups: ['ילדים', 'מבוגרים', 'VIP'],
    tables: [], guests: [], seating: {}, constraints: [],
    createdAt: 5000, updatedAt: 6000, version: 3,
    lockedGuests: [], lockedTables: [],
  };
  const result = roundTrip(family);
  check('Family: ownerName preserved', result.ownerName, 'משפחת לוי');
  check('Family: customGroups preserved (3 items)', result.customGroups.length, 3);
  check('Family: customGroups values correct', result.customGroups, ['ילדים', 'מבוגרים', 'VIP']);
}

// ── Test 4: Old cloud row missing new fields (backward compat) ────────────────
{
  // Simulates an old Supabase row that pre-dates the new fields
  const oldCloudRow = {
    id: 'old-cloud-uuid',
    name: 'חתונה ישנה',
    type: 'חתונה',
    date: '2025-01-01',
    venue: 'אולם ישן',
    version: 1,
    created_at: new Date(1000).toISOString(),
    updated_at: new Date(2000).toISOString(),
    payload: {
      localId: 'old-local-id',
      tables: [], guests: [], seating: {}, constraints: [],
      brideName: 'שרה', groomName: 'אברהם',
      createdAt: 1000, updatedAt: 2000, version: 1,
      lockedGuests: [], lockedTables: [],
      // NOTE: no celebrantName, organizationName, contactName, ownerName, customGroups
    },
  };
  const result = mapCloudEventToLocalEvent(oldCloudRow);
  check('Old row: celebrantName defaults to ""', result.celebrantName, '');
  check('Old row: organizationName defaults to ""', result.organizationName, '');
  check('Old row: contactName defaults to ""', result.contactName, '');
  check('Old row: ownerName defaults to ""', result.ownerName, '');
  check('Old row: customGroups defaults to []', result.customGroups, []);
  check('Old row: brideName still works', result.brideName, 'שרה');
  check('Old row: groomName still works', result.groomName, 'אברהם');
  check('Old row: id from localId', result.id, 'old-local-id');
}

// ── Test 5: Wedding with all fields filled ────────────────────────────────────
{
  const wedding = {
    id: 'wed-005', name: 'חתונת טל ונועה', type: 'חתונה',
    date: '2026-09-20', venue: 'גן עדן',
    brideName: 'נועה', groomName: 'טל',
    celebrantName: '', organizationName: '', contactName: '', ownerName: '',
    customGroups: ['חברים', 'משפחה'],
    tables: [{ id: 't1', name: 'שולחן 1', capacity: 8, type: 'regular' }],
    guests: [
      { id: 'g1', name: 'דנה', side: 'bride', count: 2, group: 'חברים' },
      { id: 'g2', name: 'אמיר', side: 'groom', count: 1, group: 'משפחה' },
    ],
    seating: { g1: 't1', g2: 't1' },
    constraints: [{ id: 'c1', aId: 'g1', bId: 'g2', type: 'apart' }],
    createdAt: 7000, updatedAt: 8000, version: 4,
    lockedGuests: ['g1'], lockedTables: ['t1'],
  };
  const result = roundTrip(wedding);
  check('Wedding: brideName preserved', result.brideName, 'נועה');
  check('Wedding: groomName preserved', result.groomName, 'טל');
  check('Wedding: customGroups preserved', result.customGroups, ['חברים', 'משפחה']);
  check('Wedding: constraints preserved', result.constraints, wedding.constraints);
  check('Wedding: guests count', result.guests.length, 2);
  check('Wedding: lockedGuests preserved', result.lockedGuests, ['g1']);
  check('Wedding: lockedTables preserved', result.lockedTables, ['t1']);
  check('Wedding: version preserved', result.version, 4);
  check('Wedding: updatedAt preserved', result.updatedAt, 8000);
}

console.log(`\n══════════════\nPASS: ${pass} | FAIL: ${fail}\n══════════════`);
process.exit(fail > 0 ? 1 : 0);
