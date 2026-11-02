// The one-line address shown in lists. A property saved without a city (see migration 017) prints as just the street.
export function formatAddress(street, city) {
    return city ? `${street}, ${city}` : street;
}
