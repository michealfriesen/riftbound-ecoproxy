import { getDeckFromCode } from '@piltoverarchive/riftbound-deck-codes';
import { buildCatalogDeckCodeMap, parseImportText } from './deck-import.js';

window.RiftboundDeckCodes = {
  buildCatalogDeckCodeMap,
  getDeckFromCode,
  parseImportText,
};
