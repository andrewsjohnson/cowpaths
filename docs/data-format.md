# Company-history input, version 1

The studio accepts UTF-8 JSON. Start with `examples/history-small.json`. Use **Your history → Import history or project**. Rejected input leaves the current study intact.

## Structure

```json
{
  "version": 1,
  "title": "VITL",
  "subtitle": "A more accessible tomorrow",
  "synthetic": false,
  "clinics": [{ "id": "clinic-001", "joined": "2022-01" }],
  "pharmacies": [{ "id": "pharmacy-001" }],
  "submissions": [{
    "id": "submission-001",
    "month": "2022-01",
    "clinicId": "clinic-001",
    "type": "patient",
    "fulfillments": [{
      "pharmacyId": "pharmacy-001",
      "recipients": [{ "medicationCount": 2 }]
    }]
  }],
  "milestones": [{ "month": "2022-01", "label": "First order" }]
}
```

`subtitle`, `synthetic` and `milestones` are optional. A missing synthetic flag means imported history; always set `synthetic: true` for fictional studies. Other fields are required. Unknown fields at every level are rejected instead of quietly included in project downloads.

Use art-only keys consisting of 1–64 letters, digits, underscores or hyphens. Clinic, pharmacy and submission keys must be unique within their collections. A submission key represents the entire submission, not each pharmacy-specific order created from it.

## Branching submissions

A submission can have multiple pharmacy fulfillments. Each fulfillment has anonymous recipients, each supplying only its medication count. A recipient served by two pharmacies appears once under each relevant pharmacy. The schema does not provide a distinct-person count, cross-order patient linkage or medication identities.

For clinic stock, use `type: "stock"` and exactly one recipient per fulfillment: the clinic destination. Its medication count is the number of medication line items supplied there. Patient orders use `type: "patient"`.

Example: two patients at pharmacy A, with one of those patients also receiving from pharmacy B, produce two fulfillment branches and three recipient branches beneath a single submission path.

## Time

- Dates are `YYYY-MM`, with years from 1900 through 2200. Full dates and timestamps are rejected.
- A clinic's joining month cannot follow any of its submissions or the end of the dataset.
- Milestones must be between the earliest clinic joining month and the last submission month.
- Use only approved public-facing labels. The demo milestone names and dates are invented.
- The timeline represents elapsed months. More submissions in a month produce more paths within the same chronological region.
- Submissions within a month receive deterministic spacing for legibility; this does not assert a known order within that month.
- Empty months still occupy time. A clinic may join before the first submission.

Labels use Canvas text and DOM `textContent`; they are not interpreted as HTML.

## Limits and sampling

UI import accepts files up to 16 MB. The validated schema accepts 1–500 clinics, 1–100 pharmacies, 1–20,000 submissions and up to 12 milestones. A submission can contain 1–20 fulfillments. Patient fulfillments can contain 1–100 recipients, each with 1–50 medications. The complete history has a maximum of 120,000 medication leaves.

The default drawing budget is 1,800 submissions. Above it, the renderer selects the lowest stable submission-key hashes without replacement. Sampling is explicit in the UI and exported image. All children of selected submissions are retained. Higher budgets are available under **How the history becomes art**. Every active clinic retains its persistent lane even if none of its submissions falls in the sample.

The history cutoff includes the selected month. Sample membership can change as the selected period grows. Use the full budget when every submission must be included and the device can handle it.

## CSV adapter

Export exactly these columns, in any order:

| Column | Meaning |
| --- | --- |
| `submission_key` | Source key shared by all rows of one submission |
| `month` | Submission month in `YYYY-MM` format |
| `clinic_key` | Source clinic key |
| `order_type` | `patient` or `stock` |
| `pharmacy_key` | Source pharmacy key |
| `recipient_key` | Recipient grouping key within the submission; use `clinic-stock` for stock |
| `medication_count` | Number of medication line items for this recipient at this pharmacy |

Use one row per submission/pharmacy/recipient tuple. Aggregate medication line items first; duplicate tuples are rejected. Rows belonging to one submission must agree on month, clinic and type. The parser supports quoted fields, commas, escaped quotes and CRLF.

```sh
node scripts/import-csv.mjs /path/to/export.csv vitl-history.local.json "VITL"
```

The converter:

1. Builds sequential clinic, pharmacy and submission art keys from sorted source keys.
2. Groups rows into the hierarchy and removes all recipient keys.
3. Derives joining months from each clinic's first submission.
4. Validates the result and creates a JSON file, refusing to overwrite an existing file.

No source-key mapping is written. A later export with a different entity set may assign different art keys; retain a project for exact reproduction or provide stable art keys directly in JSON. Add approved milestones to the converted file as desired.

The adapter deliberately does not guess a database query. Select production table names, joins, submission grouping and exclusions for canceled/test activity from your actual schema. The CSV should contain no names, addresses, prescription directions, medication names or notes: the art model does not need them. Key replacement is a data-minimization step, not a substitute for your company's decision about what may be published.

## Projects

**Save project** writes a `cowpaths-project` object with version 1, renderer version 1.0.0, validated history and composition settings. Reopen it with the same input control. It contains a copy of the history. No browser storage is used, so save before closing the tab if you want to retain your study.
