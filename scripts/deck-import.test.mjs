import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCatalogDeckCodeMap,
  catalogCodeToDeckCode,
  parseImportText,
} from '../src/deck-import.js';

describe('catalogCodeToDeckCode', () => {
  it('normalizes gallery, alternate, signed, rune, and special identifiers', () => {
    assert.equal(catalogCodeToDeckCode('SFD-001-221'), 'SFD-001');
    assert.equal(catalogCodeToDeckCode('UNL-079a-219'), 'UNL-079a');
    assert.equal(catalogCodeToDeckCode('SFD-223-star-221'), 'SFD-223s');
    assert.equal(catalogCodeToDeckCode('VEN-r01'), 'VEN-R01');
    assert.equal(catalogCodeToDeckCode('VEN-sp1-006'), 'VEN-SP1');
  });

  it('maps deck codes to catalog variants', () => {
    const map = buildCatalogDeckCodeMap([
      { variantNumber: 'OGN-001' },
      { variantNumber: 'VEN-097-166' },
    ]);
    assert.equal(map.get('OGN-001'), 'OGN-001');
    assert.equal(map.get('VEN-097'), 'VEN-097-166');
  });
});

describe('parseImportText', () => {
  it('combines main deck and sideboard counts from a deck code', () => {
    const decoder = () => ({
      mainDeck: [{ cardCode: 'OGN-001', count: 3 }],
      sideboard: [
        { cardCode: 'OGN-001', count: 1 },
        { cardCode: 'VEN-SP1', count: 2 },
      ],
    });

    assert.deepEqual(parseImportText('CUAACDIBAECQAYIAAA', decoder), [
      { cardCode: 'OGN-001', count: 4 },
      { cardCode: 'VEN-SP1', count: 2 },
    ]);
  });

  it('retains support for whitespace-separated card lists', () => {
    assert.deepEqual(parseImportText('OGN-001 OGS-002-variant', () => assert.fail()), [
      { cardCode: 'OGN-001', count: 1 },
      { cardCode: 'OGS-002', count: 1 },
    ]);
  });

  it('rejects empty input', () => {
    assert.throws(() => parseImportText(' ', () => assert.fail()), /Paste a deck code/);
  });
});
