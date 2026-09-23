/** The Trip currencies the client agreed (ANSWERS.md, "Currencies and conversion"). */
export const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'NZD', 'BDT'] as const;

export type Currency = (typeof CURRENCIES)[number];
