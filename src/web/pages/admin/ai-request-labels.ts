const MICRO = 1_000_000;

/** Cost is kept in millionths of a US dollar; shown to four places so small requests are not rounded to nothing. */
export const costText = (costMicroUsd: number): string => `US$${(costMicroUsd / MICRO).toFixed(4)}`;
