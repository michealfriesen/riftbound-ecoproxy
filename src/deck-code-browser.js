import { getDeckFromCode } from '@piltoverarchive/riftbound-deck-codes';
import { buildCatalogDeckCodeMap, parseImportText, validateImportSize } from './deck-import.js';

window.RiftboundDeckCodes = {
  buildCatalogDeckCodeMap,
  getDeckFromCode,
  parseImportText,
  validateImportSize,
};
