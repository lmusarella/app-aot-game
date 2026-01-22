export async function initView() {
  const { initFabs } = await import('./fab.js');
  initFabs();
}
