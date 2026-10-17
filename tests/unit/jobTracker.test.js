import { describe, it, expect } from 'vitest';
import { 
  normalizeTrackedJob, 
  validateTrackedJob, 
  filterAndSortTrackedJobs, 
  stageForStatus, 
  nextStage 
} from '../../src/utils/jobTracker.js';

describe('utils/jobTracker', () => {
  describe('normalizeTrackedJob', () => {
    it('should normalize a valid job input with all fields', () => {
      const input = {
        title: 'A very long job title that exceeds 160 characters',
        company: 'Test Company',
        location: 'New York',
        url: 'https://example.com',
        notes: 'Some notes here',
        deadline: '2023-12-31',
        status: 'applied',
        order: 1,
        salary: '50000',
        dateApplied: '2023-10-01',
        contactPerson: 'John Doe',
        contactEmail: 'john@example.com',
        workMode: 'Remote',
        interviewRound: 'Technical',
        interviewAt: '2023-10-05T10:00',
        interviewFormat: 'Video',
        interviewLink: 'https://example.com/interview',
      };
      const result = normalizeTrackedJob(input);
      expect(result.title).toHaveLengthLessThanOrEqualTo(160);
      expect(result.company).toHaveLengthLessThanOrEqualTo(160);
      expect(result.notes).toHaveLengthLessThanOrEqualTo(4000);
      expect(result.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.status).toBe('applied');
      expect(result.workMode).toBe('Remote');
    });

    it('should default status to wishlist if invalid', () => {
      const input = { status: 'invalid' };
      const result = normalizeTrackedJob(input);
      expect(result.status).toBe('wishlist');
    });

    it('should handle missing optional fields gracefully', () => {
      const input = {
        title: 'Test Job',
        company: 'TestCo',
        // omitting url, notes, deadline, etc.
      };
      const result = normalizeTrackedJob(input);
      expect(result.url).toBe('');
      expect(result.notes).toBe('');
      expect(result.deadline).toBe('');
    });
  });

  describe('validateTrackedJob', () => {
    it('should return valid when all required fields are present', () => {
      const input = { title: 'Test Job', company: 'TestCo', contactEmail: 'test@example.com' };
      const { valid } = validateTrackedJob(input);
      expect(valid).toBe(true);
    });

    it('should add errors for missing title', () => {
      const input = { company: 'TestCo', contactEmail: 'test@example.com' };
      const { errors, valid } = validateTrackedJob(input);
      expect(valid).toBe(false);
      expect(errors.title).toBe('Job title is required');
    });

    it('should detect invalid email format', () => {
      const input = { title: 'Test', company: 'TestCo', contactEmail: 'invalid-email' };
      const { errors, valid } = validateTrackedJob(input);
      expect(valid).toBe(false);
      expect(errors.contactEmail).toBe('Use a valid email address');
    });

    it('should validate deadline format', () => {
      const input = { title: 'Test', company: 'TestCo', deadline: '31-12-2023' };
      const { errors, valid } = validateTrackedJob(input);
      expect(valid).toBe(false);
      expect(errors.deadline).toBe('Use a valid date');
    });
  });

  describe('filterAndSortTrackedJobs', () => {
    it('should filter jobs based on search term', () => {
      const jobs = [
        { title: 'Job One', company: 'Company A' },
        { title: 'Job Two', company: 'Company B' },
      ];
      const filtered = filterAndSortTrackedJobs(jobs, 'one');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Job One');
    });

    it('should sort jobs by order then updatedAt', () => {
      const jobs = [
        { title: 'Job C', order: 3, updatedAt: '2023-10-01' },
        { title: 'Job A', order: 1, updatedAt: '2023-10-03' },
        { title: 'Job B', order: 2, updatedAt: '2023-10-02' },
      ];
      const sorted = filterAndSortTrackedJobs(jobs);
      expect(sorted[0].title).toBe('Job A');
      expect(sorted[1].title).toBe('Job B');
      expect(sorted[2].title).toBe('Job C');
    });
  });

  describe('stageForStatus and nextStage', () => {
    it('should return correct stage for valid status', () => {
      const stage = stageForStatus('interview');
      expect(stage.label).toBe('Interviewing');
    });

    it('should return null for nextStage when in last column', () => {
      expect(nextStage('rejected')).toBeNull();
    });

    it('should handle undefined status gracefully', () => {
      const stage = stageForStatus(undefined);
      expect(stage.id).toBe('wishlist');
    });
  });
});