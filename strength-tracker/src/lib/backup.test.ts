import { describe, expect, it } from 'vitest';
import { backupFilename, parseBackup, setLogsToCsv } from './backup';
import type { BackupFile, Exercise, SetLog } from '../db/types';

const validBackup: BackupFile = {
  format: 'strength-tracker',
  version: 1,
  exportedAt: '2026-08-11T10:00:00.000Z',
  exercises: [],
  templates: [],
  sessions: [],
  setLogs: [],
  bodyScans: [],
  settings: null,
};

describe('parseBackup', () => {
  it('accepts a file this app wrote', () => {
    expect(parseBackup(JSON.stringify(validBackup))?.format).toBe('strength-tracker');
  });

  it('refuses malformed JSON', () => {
    expect(parseBackup('{ not json')).toBeNull();
  });

  it('refuses a JSON file from somewhere else', () => {
    expect(parseBackup(JSON.stringify({ hello: 'world' }))).toBeNull();
    expect(parseBackup(JSON.stringify({ ...validBackup, format: 'other-app' }))).toBeNull();
  });

  it('refuses a file missing a table', () => {
    const { setLogs: _dropped, ...missing } = validBackup;
    expect(parseBackup(JSON.stringify(missing))).toBeNull();
  });
});

describe('setLogsToCsv', () => {
  const exercises = [
    { id: 'back_squat', name: 'Back squat' } as Exercise,
    { id: 'romanian_deadlift', name: 'Rumænsk dødløft' } as Exercise,
  ];
  const sessions = [{ id: 's1', date: '2026-08-11', templateName: 'Full body A' }];
  const setLogs: SetLog[] = [
    {
      id: 'a',
      sessionId: 's1',
      exerciseId: 'back_squat',
      setNumber: 1,
      weightKg: 82.5,
      reps: 5,
      rir: 2,
      warmup: false,
      notes: '',
      timestamp: 1,
      pr: { weight: true, e1rm: true },
    },
    {
      id: 'b',
      sessionId: 's1',
      exerciseId: 'romanian_deadlift',
      setNumber: 1,
      weightKg: 60,
      reps: 10,
      rir: null,
      warmup: true,
      notes: 'føltes tungt, kommaer; her',
      timestamp: 2,
      pr: null,
    },
  ];

  const csv = setLogsToCsv(setLogs, sessions, exercises);
  const lines = csv.split('\n');

  it('writes a header and one line per set', () => {
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('date,session_id,template')).toBe(true);
  });

  it('keeps dot decimals and the estimated 1RM', () => {
    expect(lines[1]).toContain('82.5');
    expect(lines[1]).toContain('96.25'); // 82.5 * (1 + 5/30)
  });

  it('marks PRs and warmups', () => {
    expect(lines[1]).toContain('weight e1rm');
    expect(lines[2]).toContain(',yes,');
  });

  it('quotes cells containing a comma', () => {
    expect(lines[2]).toContain('"føltes tungt, kommaer; her"');
  });
});

describe('backupFilename', () => {
  it('stamps the date', () => {
    expect(backupFilename('styrketraening', 'json')).toMatch(
      /^styrketraening-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });
});
