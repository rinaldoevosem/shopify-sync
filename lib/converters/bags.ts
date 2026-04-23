import { AirtableRecord, ShopifyProductInput } from "./shared";

// TODO: Port once the CSV structure for this category is confirmed.
export function convertItem(_row: AirtableRecord): ShopifyProductInput {
  throw new Error("Converter not yet implemented for this category — please provide the CSV for review");
}
