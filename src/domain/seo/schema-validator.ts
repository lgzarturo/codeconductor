import type { AuditCheck, JsonLdBlock, SchemaValidationResult } from './seo-types';

const HOTEL_TYPES = [
  'Hotel', 'LodgingBusiness', 'HotelRoom', 'LocalBusiness', 'Resort',
  'Motel', 'Hostel', 'BedAndBreakfast', 'Campground', 'RV Park',
];

const SUPPORTING_TYPES = [
  'BreadcrumbList', 'FAQPage', 'Review', 'AggregateRating',
  'Organization', 'WebSite', 'ImageObject', 'Event',
  'TouristAttraction', 'HowTo', 'WebPage', 'Person',
];

const REQUIRED_HOTEL_PROPERTIES = ['name', 'address', 'telephone', 'image'];

const RECOMMENDED_HOTEL_PROPERTIES = ['priceRange', 'description', 'url', 'geo'];

function extractJsonLdBlocks(html: string): JsonLdBlock[] {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks: JsonLdBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === 'object' && '@type' in item) {
          blocks.push({
            type: String(item['@type']),
            properties: item,
            raw: match[1].trim(),
          });
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }

  return blocks;
}

function validateHotelSchema(block: JsonLdBlock): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const prop of REQUIRED_HOTEL_PROPERTIES) {
    if (!(prop in block.properties)) {
      errors.push(`Missing required property: ${prop}`);
    }
  }

  for (const prop of RECOMMENDED_HOTEL_PROPERTIES) {
    if (!(prop in block.properties)) {
      warnings.push(`Missing recommended property: ${prop}`);
    }
  }

  if ('address' in block.properties) {
    const address = block.properties.address;
    if (typeof address === 'object' && address !== null) {
      const addrObj = address as Record<string, unknown>;
      if (!('streetAddress' in addrObj) && !('addressLocality' in addrObj)) {
        errors.push('Address missing streetAddress or addressLocality');
      }
    }
  }

  if ('image' in block.properties) {
    const image = block.properties.image;
    if (typeof image === 'string' && !image.startsWith('http')) {
      warnings.push('Image URL should be absolute');
    }
  }

  return {
    valid: errors.length === 0,
    type: block.type,
    errors,
    warnings,
  };
}

function validateSupportingSchema(block: JsonLdBlock): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (block.type === 'BreadcrumbList') {
    if (!('itemListElement' in block.properties)) {
      errors.push('BreadcrumbList missing itemListElement');
    }
  }

  if (block.type === 'FAQPage') {
    if (!('mainEntity' in block.properties)) {
      errors.push('FAQPage missing mainEntity');
    }
  }

  if (block.type === 'AggregateRating') {
    if (!('ratingValue' in block.properties)) {
      errors.push('AggregateRating missing ratingValue');
    }
    if (!('reviewCount' in block.properties) && !('ratingCount' in block.properties)) {
      warnings.push('AggregateRating missing reviewCount or ratingCount');
    }
  }

  if (block.type === 'Organization') {
    if (!('name' in block.properties)) {
      errors.push('Organization missing name');
    }
    if (!('url' in block.properties)) {
      warnings.push('Organization missing url');
    }
  }

  return {
    valid: errors.length === 0,
    type: block.type,
    errors,
    warnings,
  };
}

export function validateSchema(html: string): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const blocks = extractJsonLdBlocks(html);

  if (blocks.length === 0) {
    checks.push({
      name: 'json-ld-presence',
      category: 'schema',
      severity: 'error',
      message: 'No JSON-LD structured data found',
      remediation: 'Add <script type="application/ld+json"> with Hotel or LodgingBusiness schema.',
    });
    return checks;
  }

  checks.push({
    name: 'json-ld-presence',
    category: 'schema',
    severity: 'pass',
    message: `Found ${blocks.length} JSON-LD block(s)`,
  });

  const hotelBlocks = blocks.filter((b) => HOTEL_TYPES.includes(b.type));
  const supportingBlocks = blocks.filter((b) => SUPPORTING_TYPES.includes(b.type));
  const unknownBlocks = blocks.filter(
    (b) => !HOTEL_TYPES.includes(b.type) && !SUPPORTING_TYPES.includes(b.type)
  );

  if (hotelBlocks.length === 0) {
    checks.push({
      name: 'hotel-schema',
      category: 'schema',
      severity: 'error',
      message: `No Hotel/Hospitality schema found. Types found: ${blocks.map((b) => b.type).join(', ')}`,
      remediation: 'Add a Hotel, LodgingBusiness, or Resort schema with required properties.',
    });
  }

  for (const block of hotelBlocks) {
    const result = validateHotelSchema(block);
    if (result.valid) {
      checks.push({
        name: `schema-${block.type}`,
        category: 'schema',
        severity: 'pass',
        message: `${block.type} schema valid`,
      });
    } else {
      checks.push({
        name: `schema-${block.type}`,
        category: 'schema',
        severity: 'error',
        message: `${block.type} schema invalid: ${result.errors.join('; ')}`,
        remediation: `Fix the following properties: ${result.errors.join(', ')}`,
      });
    }

    if (result.warnings.length > 0) {
      checks.push({
        name: `schema-${block.type}-warnings`,
        category: 'schema',
        severity: 'warning',
        message: `${block.type} recommendations: ${result.warnings.join('; ')}`,
      });
    }
  }

  for (const block of supportingBlocks) {
    const result = validateSupportingSchema(block);
    checks.push({
      name: `schema-${block.type}`,
      category: 'schema',
      severity: result.valid ? 'pass' : 'warning',
      message: result.valid
        ? `${block.type} schema valid`
        : `${block.type} schema issues: ${result.errors.join('; ')}`,
    });
  }

  for (const block of unknownBlocks) {
    checks.push({
      name: `schema-${block.type}`,
      category: 'schema',
      severity: 'info',
      message: `Unknown schema type: ${block.type}`,
    });
  }

  return checks;
}

export function extractJsonLd(html: string): JsonLdBlock[] {
  return extractJsonLdBlocks(html);
}
