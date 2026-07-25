# Riftbound Eco Proxy

Riftbound Eco Proxy is a browser-based tool for finding Riftbound cards, building a proxy list, reviewing it, and printing it. It is a static HTML, CSS, and JavaScript project.

Card data is stored as version-controlled JSON files under `data/sets/`, validated against a JSON Schema, and combined into a single `data/cards.json` artifact that the browser loads via `fetch()`.

> **Legal notice:** Riftbound card names, rules text, and artwork are © Riot Games. This
> project is an unofficial, non-commercial fan tool and is not affiliated with or endorsed
> by Riot Games. The importer tooling (source code in `scripts/`) may carry its own open
> licence, but all Riftbound card content remains the property of Riot Games and is used
> here under Riot's fan-content and Digital Tools policies.

## Launch locally

Install Node.js dependencies (needed for the build tooling, not for the page itself):

```sh
npm install
```

Generate the combined card catalog (required before opening the page):

```sh
npm run build
```

Then start a local web server from the repository root:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in a browser. Stop the server with `Ctrl+C`.

> **Note:** The page fetches `./data/cards.json` at runtime. That file must exist before
> you open the page. Run `npm run build` to generate it.

---

## Data architecture

```
data/
  card.schema.json      ← JSON Schema (draft 2020-12) that describes every set file
  cards.json            ← Generated; loaded by the browser. Do not edit by hand.
  sets/
    OGN.json            ← Origins
    OGS.json            ← Origins – Proving Grounds
    <SET>.json          ← Future sets go here
scripts/
  validate-cards.mjs    ← Validates all set files + checks duplicate variantNumbers
  build-cards.mjs       ← Combines sets → data/cards.json (and live/data/cards.json)
  import-cards.mjs      ← Imports card data from Hugging Face (Wysme/riftbound-cards)
  import-cards.test.mjs ← Unit tests for the import transformations
```

### JSON Schema vs. card data

`data/card.schema.json` is a **schema** – a machine-readable description of what a valid
set file must look like. It is not card data. The actual card records live in
`data/sets/*.json`.

### variantNumber

`variantNumber` (e.g. `OGN-001`, `UNL-t01`, or `SFD-223-star-221`) is the globally unique
identifier for each card variant.
It is used as the localStorage key for deck counts and as the URL `?id=` parameter.
Existing saved lists remain compatible as long as the identifier does not change.

---

## Importing card data from Hugging Face

`scripts/import-cards.mjs` fetches card data from the
[Wysme/riftbound-cards](https://huggingface.co/datasets/Wysme/riftbound-cards) Hugging
Face dataset, which mirrors Riot's official Card Gallery and errata pages.

### Prerequisites

- Node.js 18 or later (for the built-in `fetch` API).
- An internet connection to reach `datasets-server.huggingface.co`.

### Import a single set

```sh
npm run import -- --set OGS
```

This fetches all rows from the dataset, extracts the OGS cards, transforms them, validates
against the schema, and writes `data/sets/OGS.json`.

### Import all known sets

```sh
npm run import -- --all
```

This imports every set listed in `KNOWN_SETS` inside `scripts/import-cards.mjs`.

### Dry run (no files written)

```sh
npm run import -- --set OGS --dry-run
npm run import -- --all --dry-run
```

Prints what would be written (set code, card count, output path) without touching any file.

### Pin a specific dataset revision

For reproducible imports, provide a commit SHA or branch name:

```sh
npm run import -- --set OGS --revision abc1234
npm run import -- --all --revision 2026-07-25
```

The revision is passed directly to the Hugging Face datasets-server API.

### All import options

| Option | Default | Description |
|--------|---------|-------------|
| `--set <CODE>` | — | Import one set (e.g. `OGS`, `OGN`) |
| `--all` | — | Import all sets in `KNOWN_SETS` |
| `--dry-run` | off | Print actions without writing files |
| `--revision <REV>` | `main` | Pin HF dataset revision |
| `--dataset <SLUG>` | `Wysme/riftbound-cards` | Override HF dataset slug |
| `--split <NAME>` | `train` | Override HF dataset split name |
| `--help` | — | Show help |

### After importing

```sh
npm run validate   # Validate all set files against the schema
npm run build      # Regenerate data/cards.json and live/data/cards.json
```

`npm run build` runs `validate` automatically before writing output, so the build fails
loudly if any imported set file is invalid or contains duplicate IDs.

### Source attribution and field mapping

Card data originates from Riot's official Riftbound Card Gallery via the
`Wysme/riftbound-cards` Hugging Face dataset.

| Source field | Schema field | Notes |
|---|---|---|
| `cardCode` | `variantNumber` | Set code uppercased; the source suffix is preserved (e.g. `ogs-001` → `OGS-001`, `unl-t01` → `UNL-t01`) |
| `cardNumber` | `collectorNumber` | Falls back to numeric part of `cardCode` |
| `fullName` / `name` | `name` | |
| `cardType` / `type` | `type` | Lowercased and validated against schema enum |
| `energy` | `energy` | |
| `power` | `power` | |
| `might` | `might` | |
| `domain` / `colors` | `colors` | Split on `,` `/` or `\|` if string |
| `tags` | `tags` | Split on `,` or `;` if string |
| `abilityEffective` → `ability` | `description` | Prefers errata-corrected text |
| `imageUrl` / `image` | `variantImageUrl` | |

### Adding support for a new set

1. Add an entry to the `KNOWN_SETS` map in `scripts/import-cards.mjs`:
   ```js
   export const KNOWN_SETS = {
     // …existing entries…
     NEW: 'New Set Name',
   };
   ```
2. Import it:
   ```sh
   npm run import -- --set NEW
   ```
3. Validate and build:
   ```sh
   npm run validate && npm run build
   ```

---

## Adding a new set manually

1. Create `data/sets/<SET-CODE>.json` using the same structure as `OGN.json`:

   ```json
   {
     "code": "SET",
     "name": "Set Name",
     "cards": [
       {
         "variantNumber": "SET-001",
         "collectorNumber": 1,
         "name": "Card Name",
         "type": "unit",
         "energy": 3,
         "power": 1,
         "might": 4,
         "colors": ["Body"],
         "tags": ["Elite"],
         "description": "Rules text. [Tap]: do something.",
         "variantImageUrl": null
       }
     ]
   }
   ```

   The set `code` must match the pattern `^[A-Z0-9]{2,6}$`.

2. Validate the new file:

   ```sh
   npm run validate
   ```

3. Rebuild the combined catalog:

   ```sh
   npm run build
   ```

4. Commit both the set file and the generated `data/cards.json` (and `live/data/cards.json`).

---

## Validate and build

| Command | Description |
|---------|-------------|
| `npm run validate` | Validate every `data/sets/*.json` against the schema; report duplicate `variantNumber`s |
| `npm run build` | Validate then combine all sets into `data/cards.json` and `live/data/cards.json` |
| `npm test` | Run unit tests for the import-cards transformation logic |

`npm run build` runs `validate` automatically before generating output, so the build fails
loudly when any set file is invalid or IDs are duplicated.

---

## Deployment

Both the root directory and `live/` are independent deployments of the same application.
After running `npm run build`, the following files are updated and should be deployed:

- `data/cards.json`
- `live/data/cards.json`

Each deployment fetches `./data/cards.json` relative to its own root.

If you are deploying from the repository root:

```sh
npm run build
python3 -m http.server 8000   # or your preferred static server
```
