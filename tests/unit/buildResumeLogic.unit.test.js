import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the actual builder closure without importing the React/router tree.
// This test previously called an undefined helper and used noncanonical employment fields.
const shell = fs.readFileSync(new URL('../../src/components/BuildResume/BuildResume.jsx', import.meta.url), 'utf8');
const source = shell.slice(shell.indexOf('    const isStepCompleted = '), shell.indexOf('    const getStepAiGuidance = '));
const completionFactory = vm.runInNewContext(`(resumeData, orderedSteps) => { ${source}; return isStepCompleted; }`);
const shouldStepCompleted = (stepId, data, stepPath) => completionFactory(data, [])(stepId, stepPath);

describe('BuildResume core logic', () => {
  describe('isStepCompleted', () => {
    it('should return true for completed steps with substantive content', () => {
      const resumeData = {
        employments: [
          { employer: 'Google', jobTitle: 'Engineer', duration: '2020-2023' }
        ],
        educations: [],
        skills: []
      };
      
      const result = shouldStepCompleted('work-history', resumeData, 'work-history');
      expect(result).toBe(true);
    });

    it('should return false for empty employment section', () => {
      const resumeData = {
        employments: [],
        educations: [],
        skills: []
      };
      
      const result = shouldStepCompleted('work-history', resumeData, 'work-history');
      expect(result).toBe(false);
    });

    it('should return false for step with only empty content', () => {
      const resumeData = {
        employments: [
          { company: '', position: '', duration: '' }
        ]
      };
      
      const result = shouldStepCompleted('work-history', resumeData, 'work-history');
      expect(result).toBe(false);
    });

    it('does not treat unmapped legacy-only employment as canonical substantive content', () => {
      const resumeData = {
        employments: [
          { company: 'Google', position: '', duration: '' }
        ]
      };
      
      const result = shouldStepCompleted('work-history', resumeData, 'work-history');
      expect(result).toBe(false);
    });

    it('should return true for education step with valid data', () => {
      const resumeData = {
        employments: [],
        educations: [
          { institution: 'Stanford', degree: 'B.S. Computer Science', startDate: '2016-2020' }
        ],
        skills: []
      };
      
      const result = shouldStepCompleted('education', resumeData, 'education');
      expect(result).toBe(true);
    });
  });

  describe('resume data processing', () => {
    it('should transform skills format for Cv1 compatibility', () => {
      const resumeData = {
        skills: [
          { skillName: 'JavaScript' },
          { name: 'React' }
        ]
      };
      
      const transformed = (resumeData.skills || []).map(skill => ({
        name: skill.skillName || skill.name || ''
      }));
      
      expect(transformed).toEqual([
        { name: 'JavaScript' },
        { name: 'React' }
      ]);
    });

    it('should correctly process education entries', () => {
      const resumeData = {
        educations: [
          { institution: 'Stanford', degree: 'B.S. Computer Science', startDate: '2016-2020' },
          { institution: 'MIT', degree: 'M.S. Computer Science', startDate: '2020-2022' }
        ]
      };
      
      const result = shouldStepCompleted('education', resumeData, 'education');
      expect(result).toBe(true);
    });

    it('should correctly process skills step', () => {
      const resumeData = {
        skills: [
          { name: 'JavaScript', level: 'expert' },
          { name: 'React', level: 'advanced' }
        ]
      };
      
      const result = shouldStepCompleted('skills', resumeData, 'skills');
      expect(result).toBe(true);
    });
  });
});