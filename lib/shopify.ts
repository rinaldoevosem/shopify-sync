import { ShopifyProductInput } from "./converters/shared";

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const API_VERSION = "2025-01";
const GRAPHQL_URL = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

async function gql(query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const payload = { query, ...(variables ? { variables } : {}) };

  while (true) {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ACCESS_TOKEN,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const retry = parseInt(res.headers.get("Retry-After") ?? "2", 10);
      await sleep(retry * 1000);
      continue;
    }

    const data = (await res.json()) as Record<string, unknown>;

    if (data.errors) {
      const errs = data.errors as unknown[];
      if (errs.some((e) => JSON.stringify(e).includes("THROTTLED"))) {
        await sleep(2000);
        continue;
      }
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const FETCH_SKU_MAP = `
query listProducts($cursor: String, $query: String!) {
  products(first: 250, after: $cursor, query: $query) {
    edges {
      node {
        id
        images(first: 1) { edges { node { id } } }
        variants(first: 1) {
          edges { node { id sku } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export interface SkuEntry {
  productGid: string;
  variantGid: string;
  hasImages: boolean;
}

export async function fetchSkuMap(productType: string): Promise<Map<string, SkuEntry>> {
  const map = new Map<string, SkuEntry>();
  let cursor: string | null = null;

  while (true) {
    const data = await gql(FETCH_SKU_MAP, {
      cursor,
      query: `product_type:${productType}`,
    });
    const products = (data.data as Record<string, unknown>).products as {
      edges: { node: { id: string; images: { edges: unknown[] }; variants: { edges: { node: { id: string; sku: string } }[] } } }[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };

    for (const { node } of products.edges) {
      const variantEdge = node.variants.edges[0]?.node;
      if (variantEdge?.sku) {
        map.set(variantEdge.sku, {
          productGid: node.id,
          variantGid: variantEdge.id,
          hasImages: node.images.edges.length > 0,
        });
      }
    }

    if (!products.pageInfo.hasNextPage) break;
    cursor = products.pageInfo.endCursor;
    await sleep(300);
  }

  return map;
}

// Creates product without variants — Shopify auto-creates a default variant.
// SKU and price are set via separate mutations after creation.
const PRODUCT_CREATE = `
mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
  productCreate(input: $input, media: $media) {
    product {
      id
      variants(first: 1) {
        edges { node { id inventoryItem { id } } }
      }
    }
    userErrors { field message }
  }
}`;

const PRODUCT_UPDATE = `
mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id }
    userErrors { field message }
  }
}`;

const METAFIELDS_SET = `
mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { key }
    userErrors { field message }
  }
}`;

const PRODUCT_CREATE_MEDIA = `
mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
  productCreateMedia(productId: $productId, media: $media) {
    media { id }
    userErrors { field message }
  }
}`;

const VARIANT_BULK_UPDATE = `
mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id }
    userErrors { field message }
  }
}`;

const INVENTORY_ITEM_UPDATE = `
mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
  inventoryItemUpdate(id: $id, input: $input) {
    inventoryItem { id sku }
    userErrors { field message }
  }
}`;

interface UpsertResult {
  action: "created" | "updated";
  productId: string;
  errors: string[];
}

export async function upsertProduct(
  product: ShopifyProductInput,
  existingEntry?: SkuEntry,
  dry = false
): Promise<UpsertResult> {
  if (dry) {
    return { action: existingEntry ? "updated" : "created", productId: existingEntry?.productGid ?? "dry-run", errors: [] };
  }

  const errors: string[] = [];

  const baseInput = {
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    vendor: product.vendor,
    productType: product.productType,
    status: product.status,
    tags: product.tags,
    seo: { description: product.seoDescription },
    ...(product.templateSuffix ? { templateSuffix: product.templateSuffix } : {}),
  };

  let productId: string;

  if (!existingEntry) {
    // Create product — no variants in input; Shopify auto-creates default variant
    const data = await gql(PRODUCT_CREATE, {
      input: baseInput,
      media: product.media,
    });
    const result = (data.data as Record<string, unknown>).productCreate as {
      product: {
        id: string;
        variants: { edges: { node: { id: string; inventoryItem: { id: string } } }[] };
      };
      userErrors: { field: string; message: string }[];
    };

    if (result.userErrors.length > 0) {
      errors.push(...result.userErrors.map((e) => `${e.field}: ${e.message}`));
      return { action: "created", productId: "", errors };
    }

    productId = result.product.id;
    const variantNode = result.product.variants.edges[0]?.node;

    if (variantNode) {
      // Set price + inventory policy on default variant
      const varData = await gql(VARIANT_BULK_UPDATE, {
        productId,
        variants: [{ id: variantNode.id, price: product.variants[0].price, inventoryPolicy: "DENY" }],
      });
      const vResult = (varData.data as Record<string, unknown>).productVariantsBulkUpdate as {
        userErrors: { field: string; message: string }[];
      };
      if (vResult.userErrors.length > 0) {
        errors.push(...vResult.userErrors.map((e) => `variant price: ${e.message}`));
      }

      // Set SKU via inventory item
      const invData = await gql(INVENTORY_ITEM_UPDATE, {
        id: variantNode.inventoryItem.id,
        input: { sku: product.sku },
      });
      const invResult = (invData.data as Record<string, unknown>).inventoryItemUpdate as {
        userErrors: { field: string; message: string }[];
      };
      if (invResult.userErrors.length > 0) {
        errors.push(...invResult.userErrors.map((e) => `sku: ${e.message}`));
      }
    }
  } else {
    const { productGid, variantGid } = existingEntry;

    const updateInput = { ...baseInput, id: productGid, handle: product.handle };
    const data = await gql(PRODUCT_UPDATE, { input: updateInput });
    const result = (data.data as Record<string, unknown>).productUpdate as {
      product: { id: string };
      userErrors: { field: string; message: string }[];
    };

    if (result.userErrors.length > 0) {
      errors.push(...result.userErrors.map((e) => `${e.field}: ${e.message}`));
    }
    productId = productGid;

    // Add images only if the product has none — avoids duplicates on repeated syncs
    if (!existingEntry.hasImages && product.media.length > 0) {
      const mediaData = await gql(PRODUCT_CREATE_MEDIA, {
        productId,
        media: product.media,
      });
      const mediaResult = (mediaData.data as Record<string, unknown>).productCreateMedia as {
        userErrors: { field: string; message: string }[];
      };
      if (mediaResult.userErrors.length > 0) {
        errors.push(...mediaResult.userErrors.map((e) => `media: ${e.message}`));
      }
    }

    // Update variant price
    const varData = await gql(VARIANT_BULK_UPDATE, {
      productId,
      variants: [{ id: variantGid, price: product.variants[0].price }],
    });
    const vResult = (varData.data as Record<string, unknown>).productVariantsBulkUpdate as {
      userErrors: { field: string; message: string }[];
    };
    if (vResult.userErrors.length > 0) {
      errors.push(...vResult.userErrors.map((e) => `price update: ${e.message}`));
    }
  }

  // Set metafields
  if (product.metafields.length > 0) {
    const mfData = await gql(METAFIELDS_SET, {
      metafields: product.metafields.map((m) => ({ ...m, ownerId: productId })),
    });
    const mfResult = (mfData.data as Record<string, unknown>).metafieldsSet as {
      userErrors: { field: string; message: string }[];
    };
    if (mfResult.userErrors.length > 0) {
      errors.push(...mfResult.userErrors.map((e) => `metafield ${e.field}: ${e.message}`));
    }
  }

  return {
    action: existingEntry ? "updated" : "created",
    productId,
    errors,
  };
}
