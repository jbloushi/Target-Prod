import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { FINANCIAL_GUIDES } from '../docs/financialGuidesContent';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

describe('financial guide screenshots', () => {
  it('every guide has at least one screenshot', () => {
    FINANCIAL_GUIDES.forEach((guide) => {
      expect(Array.isArray(guide.screenshots), `${guide.id} screenshots`).toBe(true);
      expect(guide.screenshots.length, `${guide.id} screenshots`).toBeGreaterThan(0);
    });
  });

  it('every referenced screenshot exists in public/ and is a non-empty PNG', () => {
    FINANCIAL_GUIDES.flatMap((g) => g.screenshots || []).forEach((shot) => {
      expect(shot.src.startsWith('/docs/finance/')).toBe(true);
      const file = path.join(PUBLIC_DIR, shot.src);
      expect(fs.existsSync(file), `${shot.src} exists`).toBe(true);
      const header = fs.readFileSync(file).subarray(0, 8);
      expect(header.toString('hex')).toBe('89504e470d0a1a0a');
    });
  });

  it('every screenshot has an English and an Arabic caption', () => {
    FINANCIAL_GUIDES.flatMap((g) => g.screenshots || []).forEach((shot) => {
      expect(shot.caption?.en?.length, `${shot.src} en`).toBeGreaterThan(10);
      expect(shot.caption?.ar?.length, `${shot.src} ar`).toBeGreaterThan(10);
    });
  });
});
