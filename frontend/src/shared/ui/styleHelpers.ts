import type { CSSProperties } from 'react';

export const uiStyles = {
  loadingCenter: {
    display: 'flex',
    justifyContent: 'center',
    padding: '60px',
  } as CSSProperties,
  loadingCenterText: {
    textAlign: 'center',
    padding: '60px',
  } as CSSProperties,
  searchRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
  } as CSSProperties,
  surfaceTableShell: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '14px',
    overflow: 'hidden',
  } as CSSProperties,
  actionRowEnd: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  } as CSSProperties,
  actionRowEndWithTop: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '20px',
  } as CSSProperties,
  sectionSpacing: {
    marginBottom: '20px',
  } as CSSProperties,
};

export function autoGrid(minPx: number, withBottomMargin = false): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${minPx}px, 1fr))`,
    gap: '16px',
    ...(withBottomMargin ? { marginBottom: '32px' } : {}),
  };
}
