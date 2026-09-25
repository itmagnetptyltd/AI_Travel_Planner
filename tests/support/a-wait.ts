/** Waits, checking every few milliseconds, until `condition` holds; fails if it does not within `waitMs`. */
export async function untilTrue(condition: () => boolean | Promise<boolean>, waitMs = 2_000): Promise<void> {
  const giveUpAt = Date.now() + waitMs;
  while (!(await condition())) {
    if (Date.now() > giveUpAt) throw new Error('The condition never became true.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
