import {
  activeFilterCount,
  EMPTY_RESOURCE_DRAFT,
  isValidResourceUrl,
  normaliseTags,
  opensInPlayer,
  splitParentResources,
  toRepoFilter,
  toResourceInput,
  validateResourceDraft,
  type ParentResource,
} from '../logic';

const res = (over: Partial<ParentResource>): ParentResource => ({
  id: 'r',
  organizationId: 'org1',
  title: 'Guide',
  description: '',
  kind: 'pdf',
  url: 'https://example.org/a.pdf',
  tags: [],
  therapyTypeKeys: [],
  domains: [],
  audience: 'all',
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('resource urls', () => {
  it('accepts full http(s) links only', () => {
    expect(isValidResourceUrl('https://example.org/guide.pdf')).toBe(true);
    expect(isValidResourceUrl('  http://youtu.be/abc  ')).toBe(true);
    expect(isValidResourceUrl('example.org')).toBe(false);
    expect(isValidResourceUrl('https://')).toBe(false);
    expect(isValidResourceUrl('https://nodot')).toBe(false);
    expect(isValidResourceUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('parent grouping', () => {
  it('puts shared items first (newest share first) and school items A–Z', () => {
    const items: ParentResource[] = [
      res({ id: 'school-b', title: 'Bedtime routine' }),
      res({ id: 'shared-old', share: { id: 's1', resourceId: 'shared-old', sharedBy: 'u', sharedByName: 'Ms. Riya', at: '2026-10-01T00:00:00Z' } }),
      res({ id: 'school-a', title: 'Animal sounds' }),
      res({ id: 'shared-new', share: { id: 's2', resourceId: 'shared-new', sharedBy: 'u', sharedByName: 'Mr. Arjun', at: '2026-10-20T00:00:00Z' } }),
    ];
    const g = splitParentResources(items);
    expect(g.shared.map((r) => r.id)).toEqual(['shared-new', 'shared-old']);
    expect(g.school.map((r) => r.id)).toEqual(['school-a', 'school-b']);
  });
});

describe('filters', () => {
  it('drops empty values so query keys stay stable', () => {
    expect(toRepoFilter({ search: '  ' })).toEqual({});
    expect(toRepoFilter({ search: ' bubbles ', kind: 'video', domain: 'communication' })).toEqual({ search: 'bubbles', kind: 'video', domain: 'communication' });
    expect(activeFilterCount({ therapyTypeKey: 'speech', domain: undefined })).toBe(1);
  });
});

describe('new resource draft', () => {
  it('requires a title, a type and a valid link', () => {
    expect(validateResourceDraft(EMPTY_RESOURCE_DRAFT)).toEqual({ title: 'new.errors.title', kind: 'new.errors.kind', url: 'new.errors.url' });
  });

  it('normalises tags and builds the input', () => {
    expect(normaliseTags([' Bedtime ', 'bedtime', 'Turn  taking', ''])).toEqual(['bedtime', 'turn taking']);
    const input = toResourceInput({ ...EMPTY_RESOURCE_DRAFT, title: ' Turn taking ', kind: 'video', url: ' https://example.org/v ', tags: ['Games'] });
    expect(input).toEqual({ title: 'Turn taking', description: '', kind: 'video', url: 'https://example.org/v', tags: ['games'], therapyTypeKeys: [], domains: [], audience: 'all' });
    expect(opensInPlayer('video')).toBe(true);
    expect(opensInPlayer('pdf')).toBe(false);
  });
});
