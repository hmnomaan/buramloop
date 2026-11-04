import { getEffectiveRolePermissions } from '../rolePermissions';

describe('getEffectiveRolePermissions', () => {
  it('grants Warehouse baseline permissions when the stored role is stale', () => {
    expect(getEffectiveRolePermissions('Warehouse', ['custom:read'])).toEqual(
      expect.arrayContaining([
        'custom:read',
        'stock:read',
        'stock:write',
        'warmroom:read',
        'warmroom:write',
        'attachments:read',
        'attachments:write',
        'exports:run',
      ])
    );
  });

  it('preserves the stored permissions for roles other than Warehouse', () => {
    expect(getEffectiveRolePermissions('QA', ['stock:read', 'qa:approve'])).toEqual([
      'stock:read',
      'qa:approve',
    ]);
  });
});
