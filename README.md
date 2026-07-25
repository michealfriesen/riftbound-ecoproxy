# Riftbound Eco Proxy

Riftbound Eco Proxy is a browser-based tool for finding Riftbound cards, building a proxy list, reviewing it, and printing it. It is a static HTML, CSS, and JavaScript project.

Card data is stored as version-controlled JSON files under `data/sets/`, validated against a JSON Schema, and combined into a single `data/cards.json` artifact that the browser loads via `fetch()`.

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
    OGN.json            ← Original set (Origins)
    <SET>.json          ← Future sets go here
scripts/
  validate-cards.mjs    ← Validates all set files + checks duplicate variantNumbers
  build-cards.mjs       ← Combines sets → data/cards.json (and live/data/cards.json)
```

### JSON Schema vs. card data

`data/card.schema.json` is a **schema** – a machine-readable description of what a valid
set file must look like. It is not card data. The actual card records live in
`data/sets/*.json`.

### variantNumber

`variantNumber` (e.g. `OGN-001`) is the globally unique identifier for each card variant.
It is used as the localStorage key for deck counts and as the URL `?id=` parameter.
Existing saved lists remain compatible after the migration because the identifier has not changed.

---

## Adding a new set

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
