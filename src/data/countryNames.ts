// Converts ISO 3166-1 alpha-2 country codes to readable full names using the
// browser's built-in Intl.DisplayNames (CLDR data) — no hand-maintained table.
// fallback: "code" makes unknown-but-valid codes return the code itself.
const regionNames = new Intl.DisplayNames(["en"], {
  type: "region",
  fallback: "code",
})

// Returns the full country name for an ISO alpha-2 code. Falls back to the raw
// code for unknown regions, and guards against RangeError on malformed input
// (Intl.DisplayNames throws for structurally invalid codes like "1").
export function countryNameFor(code: string): string {
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}
