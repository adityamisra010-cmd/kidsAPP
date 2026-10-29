/**
 * Placeholder brand. Rebrand by editing `brand.json` (read by app.config.ts too) and regenerating
 * the icons in assets/brand (scripts/generate-brand-assets.py).
 * `androidPackage` is permanent once published on Play Store; change it before the first release.
 */
import brand from './brand.json';

export const BRAND: Readonly<typeof brand> = brand;
