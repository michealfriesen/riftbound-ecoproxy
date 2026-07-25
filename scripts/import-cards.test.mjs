#!/usr/bin/env node
/**
 * scripts/import-cards.test.mjs
 *
 * Unit tests for the import-cards.mjs transformation and normalization logic.
 * All tests run without network access by using in-process fixtures.
 *
 * Run with:
 *   node --test scripts/import-cards.test.mjs
 *   npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCardType,
  normalizeColors,
  deriveVariantNumber,
  deriveCollectorNumber,
  transformRecord,
  transformSet,
  KNOWN_SETS,
} from './import-cards.mjs';

// ── normalizeCardType ─────────────────────────────────────────────────────────
describe('normalizeCardType', () => {
  it('returns lowercase type for valid lowercase inputs', () => {
    assert.equal(normalizeCardType('unit'), 'unit');
    assert.equal(normalizeCardType('spell'), 'spell');
    assert.equal(normalizeCardType('gear'), 'gear');
    assert.equal(normalizeCardType('battlefield'), 'battlefield');
    assert.equal(normalizeCardType('legend'), 'legend');
    assert.equal(normalizeCardType('rune'), 'rune');
  });

  it('normalizes Title-case inputs', () => {
    assert.equal(normalizeCardType('Unit'), 'unit');
    assert.equal(normalizeCardType('Spell'), 'spell');
    assert.equal(normalizeCardType('Gear'), 'gear');
    assert.equal(normalizeCardType('Battlefield'), 'battlefield');
    assert.equal(normalizeCardType('Legend'), 'legend');
    assert.equal(normalizeCardType('Rune'), 'rune');
  });

  it('normalizes UPPER_CASE inputs', () => {
    assert.equal(normalizeCardType('UNIT'), 'unit');
    assert.equal(normalizeCardType('LEGEND'), 'legend');
  });

  it('strips surrounding whitespace', () => {
    assert.equal(normalizeCardType('  unit  '), 'unit');
  });

  it('returns null for unrecognized types', () => {
    assert.equal(normalizeCardType('champion'), null);
    assert.equal(normalizeCardType('follower'), null);
    assert.equal(normalizeCardType('unknown'), null);
    assert.equal(normalizeCardType(''), null);
  });

  it('returns null for null/undefined', () => {
    assert.equal(normalizeCardType(null), null);
    assert.equal(normalizeCardType(undefined), null);
  });
});

// ── normalizeColors ───────────────────────────────────────────────────────────
describe('normalizeColors', () => {
  it('returns empty array for null/empty', () => {
    assert.deepEqual(normalizeColors(null), []);
    assert.deepEqual(normalizeColors(undefined), []);
    assert.deepEqual(normalizeColors(''), []);
  });

  it('passes through an array unchanged', () => {
    assert.deepEqual(normalizeColors(['Fury', 'Chaos']), ['Fury', 'Chaos']);
  });

  it('filters empty strings in arrays', () => {
    assert.deepEqual(normalizeColors(['Fury', '', 'Chaos']), ['Fury', 'Chaos']);
  });

  it('trims array elements', () => {
    assert.deepEqual(normalizeColors([' Fury ', ' Chaos ']), ['Fury', 'Chaos']);
  });

  it('splits comma-separated strings', () => {
    assert.deepEqual(normalizeColors('Fury,Chaos'), ['Fury', 'Chaos']);
  });

  it('splits slash-separated strings', () => {
    assert.deepEqual(normalizeColors('Fury/Chaos'), ['Fury', 'Chaos']);
  });

  it('splits pipe-separated strings', () => {
    assert.deepEqual(normalizeColors('Fury|Chaos'), ['Fury', 'Chaos']);
  });

  it('handles a single color string', () => {
    assert.deepEqual(normalizeColors('Body'), ['Body']);
  });

  it('trims whitespace around separators', () => {
    assert.deepEqual(normalizeColors('Fury , Chaos'), ['Fury', 'Chaos']);
  });
});

// ── deriveVariantNumber ───────────────────────────────────────────────────────
describe('deriveVariantNumber', () => {
  it('passes through a valid uppercase code unchanged', () => {
    assert.equal(deriveVariantNumber('OGN-001'), 'OGN-001');
    assert.equal(deriveVariantNumber('OGS-017'), 'OGS-017');
  });

  it('uppercases the set-code portion', () => {
    assert.equal(deriveVariantNumber('ogs-001'), 'OGS-001');
    assert.equal(deriveVariantNumber('ogn-056'), 'OGN-056');
  });

  it('handles numeric set codes like SP2', () => {
    assert.equal(deriveVariantNumber('sp2-006'), 'SP2-006');
  });

  it('handles variant letters (e.g. 117a)', () => {
    assert.equal(deriveVariantNumber('OGN-117a'), 'OGN-117a');
    assert.equal(deriveVariantNumber('ogn-117a'), 'OGN-117a');
  });

  it('handles numbered variant suffix (e.g. 001-2)', () => {
    assert.equal(deriveVariantNumber('OGN-001-2'), 'OGN-001-2');
  });

  it('handles token and rune card codes', () => {
    assert.equal(deriveVariantNumber('sfd-t03'), 'SFD-t03');
    assert.equal(deriveVariantNumber('unl-t01'), 'UNL-t01');
    assert.equal(deriveVariantNumber('ven-r01'), 'VEN-r01');
  });

  it('handles special-promo card codes', () => {
    assert.equal(deriveVariantNumber('ven-sp1-006'), 'VEN-sp1-006');
    assert.equal(deriveVariantNumber('ven-sp6-006'), 'VEN-sp6-006');
  });

  it('handles star card codes', () => {
    assert.equal(deriveVariantNumber('sfd-223-star-221'), 'SFD-223-star-221');
    assert.equal(deriveVariantNumber('unl-237-star-219'), 'UNL-237-star-219');
  });

  it('returns null for null/undefined', () => {
    assert.equal(deriveVariantNumber(null), null);
    assert.equal(deriveVariantNumber(undefined), null);
  });

  it('returns null when there is no dash', () => {
    assert.equal(deriveVariantNumber('OGN001'), null);
  });

  it('returns null for set codes with invalid characters', () => {
    // Set code portion has non-alphanumeric character
    assert.equal(deriveVariantNumber('OG.N-001'), null);
  });

  it('returns null for set codes that are too short', () => {
    assert.equal(deriveVariantNumber('O-001'), null);
  });

  it('returns null when number part is missing', () => {
    assert.equal(deriveVariantNumber('OGS-'), null);
    assert.equal(deriveVariantNumber('OGS-abc'), null);
  });

  it('returns null for malformed special card codes', () => {
    assert.equal(deriveVariantNumber('UNL-t'), null);
    assert.equal(deriveVariantNumber('VEN-sp1'), null);
    assert.equal(deriveVariantNumber('SFD-223-star'), null);
  });
});

// ── deriveCollectorNumber ─────────────────────────────────────────────────────
describe('deriveCollectorNumber', () => {
  it('returns the sourceNumber when it is a positive integer', () => {
    assert.equal(deriveCollectorNumber(5, 'OGN-001'), 5);
    assert.equal(deriveCollectorNumber(42, 'OGN-001'), 42);
  });

  it('falls back to card code number when sourceNumber is null/NaN', () => {
    assert.equal(deriveCollectorNumber(null, 'OGN-056'), 56);
    assert.equal(deriveCollectorNumber(NaN, 'OGS-017'), 17);
    assert.equal(deriveCollectorNumber(undefined, 'SP2-006'), 6);
  });

  it('strips leading zeros from the card code number', () => {
    assert.equal(deriveCollectorNumber(null, 'OGN-001'), 1);
    assert.equal(deriveCollectorNumber(null, 'OGN-099'), 99);
  });

  it('strips variant letter suffix from card code', () => {
    assert.equal(deriveCollectorNumber(null, 'OGN-117a'), 117);
  });

  it('derives collector numbers from token and rune card codes', () => {
    assert.equal(deriveCollectorNumber(null, 'SFD-t03'), 3);
    assert.equal(deriveCollectorNumber(null, 'VEN-r01'), 1);
  });

  it('derives collector numbers from special-promo card codes', () => {
    assert.equal(deriveCollectorNumber(null, 'VEN-sp1-006'), 1);
    assert.equal(deriveCollectorNumber(null, 'VEN-sp6-006'), 6);
  });

  it('derives the leading collector number from star card codes', () => {
    assert.equal(deriveCollectorNumber(null, 'SFD-223-star-221'), 223);
  });

  it('returns null for invalid inputs', () => {
    assert.equal(deriveCollectorNumber(null, null), null);
    assert.equal(deriveCollectorNumber(null, 'BADCODE'), null);
  });

  it('ignores zero as a sourceNumber (falls back to card code)', () => {
    assert.equal(deriveCollectorNumber(0, 'OGN-056'), 56);
  });

  it('ignores negative sourceNumber (falls back to card code)', () => {
    assert.equal(deriveCollectorNumber(-1, 'OGN-056'), 56);
  });
});

// ── transformRecord ───────────────────────────────────────────────────────────
describe('transformRecord', () => {
  /** Minimal valid source row fixture */
  const minimalRow = {
    cardCode: 'OGS-001',
    fullName: 'Annie, Fiery',
    cardType: 'legend',
    cardNumber: 1,
  };

  it('transforms a minimal valid row', () => {
    const card = transformRecord(minimalRow);
    assert.equal(card.variantNumber, 'OGS-001');
    assert.equal(card.collectorNumber, 1);
    assert.equal(card.name, 'Annie, Fiery');
    assert.equal(card.type, 'legend');
  });

  it('combines separate title and name fields', () => {
    const card = transformRecord({
      cardCode: 'OGS-002',
      title: 'Shen',
      name: 'Eye of Twilight',
      cardType: 'legend',
      cardNumber: 2,
    });
    assert.equal(card.name, 'Shen, Eye of Twilight');
  });

  it('prefers fullName over separate title and name fields', () => {
    const card = transformRecord({
      ...minimalRow,
      title: 'Incorrect',
      name: 'Fallback',
    });
    assert.equal(card.name, 'Annie, Fiery');
  });

  it('uses title when no other name field is present', () => {
    const card = transformRecord({
      cardCode: 'OGS-002',
      title: 'Standalone Title',
      cardType: 'unit',
      cardNumber: 2,
    });
    assert.equal(card.name, 'Standalone Title');
  });

  it('includes energy, power, might when present', () => {
    const card = transformRecord({
      ...minimalRow,
      energy: 5,
      power: 2,
      might: 4,
    });
    assert.equal(card.energy, 5);
    assert.equal(card.power, 2);
    assert.equal(card.might, 4);
  });

  it('passes null for nullable numeric fields', () => {
    const card = transformRecord({
      ...minimalRow,
      energy: null,
      power: null,
      might: null,
    });
    assert.equal(card.energy, null);
    assert.equal(card.power, null);
    assert.equal(card.might, null);
  });

  it('omits energy/power/might when not present in source', () => {
    const card = transformRecord(minimalRow);
    assert.equal('energy' in card, false);
    assert.equal('power' in card, false);
    assert.equal('might' in card, false);
  });

  it('normalizes colors from a string domain', () => {
    const card = transformRecord({ ...minimalRow, domain: 'Fury,Chaos' });
    assert.deepEqual(card.colors, ['Fury', 'Chaos']);
  });

  it('normalizes colors from an array domain', () => {
    const card = transformRecord({ ...minimalRow, domain: ['Body'] });
    assert.deepEqual(card.colors, ['Body']);
  });

  it('omits colors key when domain is empty', () => {
    const card = transformRecord({ ...minimalRow, domain: '' });
    assert.equal('colors' in card, false);
  });

  it('includes tags when present as an array', () => {
    const card = transformRecord({ ...minimalRow, tags: ['Annie', 'Noxus'] });
    assert.deepEqual(card.tags, ['Annie', 'Noxus']);
  });

  it('splits comma-separated tags from a string', () => {
    const card = transformRecord({ ...minimalRow, tags: 'Annie,Noxus' });
    assert.deepEqual(card.tags, ['Annie', 'Noxus']);
  });

  it('omits tags key when no tags', () => {
    const card = transformRecord(minimalRow);
    assert.equal('tags' in card, false);
  });

  it('prefers abilityEffective over ability for description', () => {
    const card = transformRecord({
      ...minimalRow,
      ability: 'Original text.',
      abilityEffective: 'Corrected text.',
    });
    assert.equal(card.description, 'Corrected text.');
  });

  it('falls back to ability when abilityEffective is absent', () => {
    const card = transformRecord({
      ...minimalRow,
      ability: 'Original text.',
    });
    assert.equal(card.description, 'Original text.');
  });

  it('omits description when no text fields are present', () => {
    const card = transformRecord(minimalRow);
    assert.equal('description' in card, false);
  });

  it('maps imageUrl to variantImageUrl', () => {
    const card = transformRecord({
      ...minimalRow,
      imageUrl: 'https://example.com/card.webp',
    });
    assert.equal(card.variantImageUrl, 'https://example.com/card.webp');
  });

  it('sets variantImageUrl to null when no image field present', () => {
    const card = transformRecord(minimalRow);
    assert.equal(card.variantImageUrl, null);
  });

  it('uppercases set code in variantNumber', () => {
    const card = transformRecord({ ...minimalRow, cardCode: 'ogs-001' });
    assert.equal(card.variantNumber, 'OGS-001');
  });

  it('handles sp2-style numeric set codes', () => {
    const card = transformRecord({ ...minimalRow, cardCode: 'sp2-006', cardNumber: 6 });
    assert.equal(card.variantNumber, 'SP2-006');
    assert.equal(card.collectorNumber, 6);
  });

  it('transforms token, rune, special-promo, and star source identifiers', () => {
    const fixtures = [
      ['sfd-t03', 't03', 'SFD-t03', 3],
      ['ven-r01', 'r01', 'VEN-r01', 1],
      ['ven-sp1-006', 'sp1-006', 'VEN-sp1-006', 1],
      ['unl-226-star-219', '226-star-219', 'UNL-226-star-219', 226],
    ];

    for (const [cardCode, cardNumber, variantNumber, collectorNumber] of fixtures) {
      const card = transformRecord({ ...minimalRow, cardCode, cardNumber });
      assert.equal(card.variantNumber, variantNumber);
      assert.equal(card.collectorNumber, collectorNumber);
    }
  });

  it('derives collectorNumber from cardCode when cardNumber absent', () => {
    const row = { ...minimalRow };
    delete row.cardNumber;
    const card = transformRecord({ ...row, cardCode: 'OGS-017' });
    assert.equal(card.collectorNumber, 17);
  });

  it('throws when cardCode is missing', () => {
    assert.throws(() => transformRecord({ fullName: 'Test', cardType: 'unit' }), /cardCode/);
  });

  it('throws when name is missing', () => {
    assert.throws(
      () => transformRecord({ cardCode: 'OGS-001', cardType: 'unit' }),
      /name/
    );
  });

  it('throws when type is unknown', () => {
    assert.throws(
      () => transformRecord({ ...minimalRow, cardType: 'champion' }),
      /Unknown card type/
    );
  });

  it('throws when cardCode is invalid', () => {
    assert.throws(
      () => transformRecord({ ...minimalRow, cardCode: 'BADCODE' }),
      /variantNumber/
    );
  });

  it('trims whitespace from name', () => {
    const card = transformRecord({ ...minimalRow, fullName: '  Garen, Commander  ' });
    assert.equal(card.name, 'Garen, Commander');
  });
});

// ── transformSet ──────────────────────────────────────────────────────────────
describe('transformSet', () => {
  /** Factory for a valid minimal fixture row for OGS */
  function makeRow(overrides = {}) {
    return {
      cardCode: 'OGS-001',
      fullName: 'Annie, Fiery',
      cardType: 'legend',
      cardNumber: 1,
      energy: 0,
      power: 0,
      might: 0,
      domain: 'Fury,Chaos',
      tags: ['Annie'],
      abilityEffective: 'At the end of your turn, ready 2 runes.',
      imageUrl: 'https://cdn.piltoverarchive.com/cards/OGS-001.webp',
      ...overrides,
    };
  }

  it('transforms a single valid row into a set file', () => {
    const result = transformSet('OGS', [makeRow()], 'Origins – Proving Grounds');
    assert.equal(result.code, 'OGS');
    assert.equal(result.name, 'Origins – Proving Grounds');
    assert.equal(result.cards.length, 1);
    assert.equal(result.cards[0].variantNumber, 'OGS-001');
  });

  it('sorts cards deterministically by variantNumber', () => {
    const rows = [
      makeRow({ cardCode: 'OGS-003', fullName: 'C', cardNumber: 3 }),
      makeRow({ cardCode: 'OGS-001', fullName: 'A', cardNumber: 1 }),
      makeRow({ cardCode: 'OGS-002', fullName: 'B', cardNumber: 2 }),
    ];
    const result = transformSet('OGS', rows, 'Origins – Proving Grounds');
    assert.deepEqual(
      result.cards.map(c => c.variantNumber),
      ['OGS-001', 'OGS-002', 'OGS-003']
    );
  });

  it('throws on duplicate variantNumber with actionable diagnostics', () => {
    const rows = [
      makeRow({ cardCode: 'OGS-001', fullName: 'Annie, Fiery', cardNumber: 1 }),
      makeRow({ cardCode: 'OGS-001', fullName: 'Annie, Fiery (duplicate)', cardNumber: 1 }),
    ];
    assert.throws(
      () => transformSet('OGS', rows, 'Origins – Proving Grounds'),
      /Duplicate variantNumber "OGS-001"/
    );
  });

  it('throws on any transformation error and reports all errors', () => {
    const rows = [
      makeRow({ cardCode: 'OGS-001', fullName: 'Annie, Fiery', cardNumber: 1 }),
      { cardCode: 'OGS-002', cardType: 'unknowntype', fullName: 'Bad Card', cardNumber: 2 },
      { cardCode: 'OGS-003', fullName: 'No Type Card', cardNumber: 3 }, // missing type
    ];
    let caught;
    try {
      transformSet('OGS', rows, 'Origins – Proving Grounds');
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, 'Expected an error to be thrown');
    assert.match(caught.message, /2 error\(s\)/);
    assert.match(caught.message, /Unknown card type/);
  });

  it('sets the correct code and name on the output', () => {
    const result = transformSet('OGN', [makeRow({ cardCode: 'OGN-001', cardNumber: 1 })], 'Origins');
    assert.equal(result.code, 'OGN');
    assert.equal(result.name, 'Origins');
  });
});

// ── KNOWN_SETS ────────────────────────────────────────────────────────────────
describe('KNOWN_SETS', () => {
  it('includes OGN and OGS at minimum', () => {
    assert.ok(KNOWN_SETS.OGN, 'Expected OGN in KNOWN_SETS');
    assert.ok(KNOWN_SETS.OGS, 'Expected OGS in KNOWN_SETS');
  });

  it('all set codes match the schema pattern', () => {
    for (const code of Object.keys(KNOWN_SETS)) {
      assert.match(code, /^[A-Z0-9]{2,6}$/, `Set code "${code}" does not match schema pattern`);
    }
  });

  it('all set names are non-empty strings', () => {
    for (const [code, name] of Object.entries(KNOWN_SETS)) {
      assert.ok(typeof name === 'string' && name.length > 0, `Set "${code}" has an empty name`);
    }
  });
});
