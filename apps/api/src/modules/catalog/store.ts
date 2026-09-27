import type { CandidateProduct, RoutineSlot } from '@mgt/domain';

// In-memory catalog for SC-P1/SC-P2 dev and testing. Real implementation queries
// `products` + `product_attributes` + `product_ingredients` (Section J canonical schema);
// this class implements the same lookup surface so the swap is a one-file change.
export interface CatalogStore {
  candidatesForSlots(slots: RoutineSlot[]): Promise<Record<RoutineSlot, CandidateProduct[]>>;
  price_cents(productId: string): number;
  isAvailable(productId: string): boolean;
  get(productId: string): CandidateProduct | undefined;
}

export class InMemoryCatalogStore implements CatalogStore {
  private products: CandidateProduct[];
  constructor(seed: CandidateProduct[]) {
    this.products = seed;
  }

  async candidatesForSlots(slots: RoutineSlot[]): Promise<Record<RoutineSlot, CandidateProduct[]>> {
    const out = {} as Record<RoutineSlot, CandidateProduct[]>;
    for (const slot of slots) {
      out[slot] = this.products.filter((p) => p.slot === slot && p.status === 'active');
    }
    return out;
  }

  price_cents(productId: string): number {
    return this.products.find((p) => p.id === productId)?.price_cents ?? 0;
  }

  isAvailable(productId: string): boolean {
    return this.products.some((p) => p.id === productId && p.status === 'active');
  }

  get(productId: string): CandidateProduct | undefined {
    return this.products.find((p) => p.id === productId);
  }
}

// Seed data standing in for partner feed #1 (Section H SC-P2 KPI: >=200 SKUs, >=3 per slot)
// until real ingestion lands. Enough variety here to exercise every engine path.
export const SEED_CATALOG: CandidateProduct[] = [
  { id: 'cleanser-gentle', slot: 'cleanser', ingredients: ['glycerin'], price_cents: 1800, concern_tags: [], concern_weights: { acne_focus: 0.3 }, type_fit: { oil_control_need: 0.5 }, brand_id: 'brand-a', status: 'active' },
  { id: 'cleanser-salicylic', slot: 'cleanser', ingredients: ['salicylic_acid'], price_cents: 2200, concern_tags: [], concern_weights: { acne_focus: 1 }, type_fit: { oil_control_need: 1 }, brand_id: 'brand-a', status: 'active' },
  { id: 'treatment-niacinamide', slot: 'treatment', ingredients: ['niacinamide'], price_cents: 3000, concern_tags: [], concern_weights: { acne_focus: 0.8, texture_focus: 0.5 }, type_fit: { oil_control_need: 0.8 }, brand_id: 'brand-a', status: 'active' },
  { id: 'treatment-retinol', slot: 'treatment', ingredients: ['retinol'], price_cents: 4200, concern_tags: [], concern_weights: { aging_focus: 1, texture_focus: 0.4 }, type_fit: {}, brand_id: 'brand-c', status: 'active' },
  { id: 'moisturizer-gel', slot: 'moisturizer', ingredients: ['hyaluronic_acid', 'glycerin'], price_cents: 2800, concern_tags: [], concern_weights: {}, type_fit: { oil_control_need: 0.7, hydration_need: 0.5 }, brand_id: 'brand-b', status: 'active' },
  { id: 'moisturizer-rich', slot: 'moisturizer', ingredients: ['ceramides', 'glycerin'], price_cents: 3200, concern_tags: [], concern_weights: {}, type_fit: { hydration_need: 1 }, brand_id: 'brand-b', status: 'active' },
  { id: 'spf-lightweight', slot: 'sunscreen', ingredients: ['zinc_oxide'], price_cents: 1900, concern_tags: [], concern_weights: {}, type_fit: {}, brand_id: 'brand-b', status: 'active' },
  { id: 'toner-hydrating', slot: 'toner', ingredients: ['glycerin'], price_cents: 1600, concern_tags: [], concern_weights: {}, type_fit: { hydration_need: 0.6 }, brand_id: 'brand-a', status: 'active' },
  { id: 'eye-cream-basic', slot: 'eye', ingredients: ['glycerin'], price_cents: 2400, concern_tags: [], concern_weights: { eye_area_focus: 0.8 }, type_fit: {}, brand_id: 'brand-c', status: 'active' },
];
