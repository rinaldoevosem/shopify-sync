import { AirtableRecord, ShopifyProductInput } from "./shared";

// TODO: Port from convert_bracelets.py once the Bracelets CSV structure is confirmed.
// Bracelets CSV is expected to have similar columns to Rings plus:
//   - bracelet_style, tennis_style, tennis_setting, prong_setting, length, New website, Archived
export function convertBracelet(_row: AirtableRecord): ShopifyProductInput {
  throw new Error("Bracelets converter not yet implemented — please upload the Bracelets CSV for review");
}
