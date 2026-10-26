/** Today's date in the user's local calendar as YYYY-MM-DD. The engine only ever receives this value. */
export function todayISO(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

let counter = 0;
/** Short unique id for locally created records (quotes). */
export function newId(): string {
  counter += 1;
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : String(Math.random()).slice(2, 10);
  return `${random}${counter}`;
}
