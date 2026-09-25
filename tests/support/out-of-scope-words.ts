/**
 * What each of the nine features that are not part of this build (BRD §28) would look like in words. Shared by the unit and browser
 * tests, so they cannot drift apart. A word here is a word that must not appear on a page, in an email or in a web address.
 */
export const WEATHER = /\b(weather|forecast|temperatures?|humidity|rain(fall|y)?|showers?|precipitation|windy|sunny|cloudy|snow(fall|y)?|degrees|celsius|fahrenheit|uv index)\b|°\s?[CF]\b|[℃℉☀☁☂☔⛅⛈❄]/iu;

export const LIVE_INFORMATION = /\b(real-?time|live (prices?|availability|updates?|data|rates?)|open now|last updated)\b/i;

export const AVAILABILITY = /\b(vacanc\w+|availability|available rooms?|rooms? (left|available)|sold out|check-?in time)\b/i;

export const FLIGHT_INFORMATION = /\b(flights?|airlines?|airfares?|departures?|arrivals?|boarding)\b/i;

export const MAP = /\b(maps?|directions|navigate|satellite|street view|view on map|open in maps)\b|\b(geo|maps|intent):/i;

export const CALENDAR = /\b(calendar|ical|webcal|outlook|vcalendar|vevent|add to calendar|export to (google|outlook|apple)|save to (phone|device))\b|\.ics\b|text\/calendar/i;

export const BOOKING = /\b(book\w*|prebook\w*|reserve\w*|reservations?|pay(ment|ing)?|buy|purchase\w*|tickets?|checkout|order|cart|rent|hire)\b/i;

/** A word for a language, or for choosing one. */
export const LANGUAGE = /\b(languages?|locales?|translat\w+|english|español|français|deutsch|日本語|中文)\b/i;

/** An instruction to the AI to answer in a language. "Respond in JSON" is not one. */
export const IN_ANOTHER_LANGUAGE = /\b(languages?|translat\w+)\b|\b(respond|reply|answer|write|speak) in (english|french|spanish|german|japanese|chinese|korean|italian|portuguese|arabic|hindi|another|the traveler'?s)\b/i;

export const VOICE = /\b(microphone|mic|voice|speak|speech|dictat\w+|record(ing)?|listen|audio|talk)\b/i;

/** Something that happened, or may happen, to a Trip in the world, as opposed to something the Traveler did to it. */
export const RISK_OR_DISRUPTION = /\b(risks?|disruptions?|delays?|delayed|cancell?(ed|ations?)?|strikes?|storms?|typhoons?|hurricanes?|weather|rain|floods?|flooding|earthquakes?|wildfires?|heat ?waves?|severe|danger\w*|hazards?|heads-up|incidents?|outages?|warnings?|advisor(y|ies)|alerts?|closures?|closed|evacuat\w+|outbreaks?|unrest|emergenc(y|ies))\b/i;

/** Words that name one of the nine features, for the names of routes, files and web addresses. */
export const FEATURE_NAMES = /^(weather|forecast|flights?|hotels?|maps?|geocod\w*|calendar|ical|ics|webcal|book|booking|bookings|reserve|payment|payments|checkout|voice|speech|audio|microphone|translate|translation|i18n|locale|language|languages)$/i;

/** The words in a name written as camelCase, PascalCase, kebab-case, snake_case or a path. */
export const wordsInName = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
