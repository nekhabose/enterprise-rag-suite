export const tenantScopeClause = (
  tenantColumn: string,
  tenantParamIndex: number,
  isGlobal = false,
): string => {
  if (isGlobal) return '';
  return ` AND ${tenantColumn} = $${tenantParamIndex}`;
};

export const assertTenantScopedAccess = (
  actorTenantId: number | undefined,
  targetTenantId: number,
  isGlobalActor: boolean,
): boolean => {
  if (isGlobalActor) return true;
  return Number(actorTenantId) === Number(targetTenantId);
};
