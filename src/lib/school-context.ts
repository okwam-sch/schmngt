/** Per-tab preference only; the database independently authorizes every request. */
export function requestedSchoolId(): string | null {
  return typeof window === 'undefined' ? null : window.sessionStorage.getItem('portal-school');
}
export function rememberSchoolId(id: string) {
  window.sessionStorage.setItem('portal-school', id);
}