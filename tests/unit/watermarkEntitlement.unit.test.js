import { describe, it, expect } from 'vitest';
import { 
  shouldRenderWatermark, 
  resolvePreviewWatermark, 
  readEntitlement 
} from '../../src/utils/watermarkEntitlement.js';

describe('watermarkEntitlement unit tests', () => {
  describe('shouldRenderWatermark', () => {
    it('should return true for free user with watermark enabled', () => {
      const watermark = { enableFreeWatermark: true, watermarkText: 'Created with IME365 (Free Plan)' };
      const entitlement = { isPaid: false };
      expect(shouldRenderWatermark(watermark, entitlement)).toBe(true);
    });

    it('should return false for paid user regardless of watermark setting', () => {
      const watermark = { enableFreeWatermark: true, watermarkText: 'Created with IME365 (Free Plan)' };
      const entitlement = { isPaid: true };
      expect(shouldRenderWatermark(watermark, entitlement)).toBe(false);
    });

    it('should return false for free user with watermark disabled', () => {
      const watermark = { enableFreeWatermark: false, watermarkText: 'Created with IME365 (Free Plan)' };
      const entitlement = { isPaid: false };
      expect(shouldRenderWatermark(watermark, entitlement)).toBe(false);
    });

    it('should return false when no watermark object provided', () => {
      const watermark = null;
      const entitlement = { isPaid: false };
      expect(shouldRenderWatermark(watermark, entitlement)).toBe(false);
    });
  });

  describe('resolvePreviewWatermark', () => {
    it('should return watermark object for free user', () => {
      const watermark = { enableFreeWatermark: true, watermarkText: 'Created with IME365 (Free Plan)' };
      const entitlement = { isPaid: false };
      expect(resolvePreviewWatermark({ watermark, isPaid: false })).toEqual(watermark);
    });

    it('should return null for paid user', () => {
      const watermark = { enableFreeWatermark: true, watermarkText: 'Created with IME365 (Free Plan)' };
      expect(resolvePreviewWatermark({ watermark, isPaid: true })).toBeNull();
    });

    it('should return null when removesWatermark is true', () => {
      const watermark = { enableFreeWatermark: true, watermarkText: 'Created with IME365 (Free Plan)' };
      expect(resolvePreviewWatermark({ watermark, removesWatermark: true })).toBeNull();
    });

    it('should return null when no parameters provided', () => {
      expect(resolvePreviewWatermark()).toBeNull();
    });
  });

  describe('readEntitlement', () => {
    it('should handle nested _entitlement format', () => {
      const input = { _entitlement: { isPaid: true } };
      expect(readEntitlement(input)).toEqual({ removesWatermark: false, isPaid: true });
    });

    it('should handle flat format', () => {
      const input = { removesWatermark: true };
      expect(readEntitlement(input)).toEqual({ removesWatermark: true, isPaid: false });
    });

    it('should handle mixed format', () => {
      const input = { _entitlement: { removesWatermark: true }, isPaid: true };
      expect(readEntitlement(input)).toEqual({ removesWatermark: true, isPaid: true });
    });

    it('should return default values when no input', () => {
      expect(readEntitlement()).toEqual({ removesWatermark: false, isPaid: false });
    });
  });
});