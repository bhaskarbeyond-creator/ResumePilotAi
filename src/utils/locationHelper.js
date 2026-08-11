/**
 * Utility helper to infer Country from City / Location text
 * Supports:
 * - Full "City, State, Country" strings (e.g. "Visakhapatnam, Andhra Pradesh, India" -> "India")
 * - Abbreviated country tokens (e.g. "San Francisco, CA, USA" -> "United States")
 * - Major city lookup dictionary (e.g. "Visakhapatnam" -> "India", "London" -> "United Kingdom")
 * - Indian/US/Canadian/Australian state name & code detection
 */

const COUNTRY_ALIASES = {
    'usa': 'United States',
    'us': 'United States',
    'united states': 'United States',
    'united states of america': 'United States',
    'u.s.a.': 'United States',
    'u.s.': 'United States',
    'uk': 'United Kingdom',
    'united kingdom': 'United Kingdom',
    'england': 'United Kingdom',
    'great britain': 'United Kingdom',
    'uae': 'United Arab Emirates',
    'united arab emirates': 'United Arab Emirates',
    'in': 'India',
    'india': 'India',
    'bharat': 'India',
    'canada': 'Canada',
    'australia': 'Australia',
    'germany': 'Germany',
    'france': 'France',
    'singapore': 'Singapore',
    'japan': 'Japan',
    'china': 'China',
    'brazil': 'Brazil',
    'mexico': 'Mexico',
    'netherlands': 'Netherlands',
    'spain': 'Spain',
    'italy': 'Italy',
    'new zealand': 'New Zealand',
    'ireland': 'Ireland',
    'south africa': 'South Africa',
    'saudi arabia': 'Saudi Arabia',
    'qatar': 'Qatar',
    'oman': 'Oman',
    'kuwait': 'Kuwait',
    'bahrain': 'Bahrain',
    'philippines': 'Philippines',
    'malaysia': 'Malaysia',
    'indonesia': 'Indonesia',
    'thailand': 'Thailand',
    'vietnam': 'Vietnam',
    'pakistan': 'Pakistan',
    'bangladesh': 'Bangladesh',
    'sri lanka': 'Sri Lanka',
    'nepal': 'Nepal',
    'sweden': 'Sweden',
    'norway': 'Norway',
    'denmark': 'Denmark',
    'finland': 'Finland',
    'switzerland': 'Switzerland',
    'austria': 'Austria',
    'belgium': 'Belgium',
    'poland': 'Poland',
    'russia': 'Russia',
    'ukraine': 'Ukraine',
    'israel': 'Israel',
    'turkey': 'Turkey',
    'egypt': 'Egypt',
    'south korea': 'South Korea',
    'korea': 'South Korea',
    'taiwan': 'Taiwan',
    'hong kong': 'Hong Kong'
};

const INDIAN_STATES = [
    'andhra pradesh', 'telangana', 'maharashtra', 'karnataka', 'tamil nadu',
    'kerala', 'gujarat', 'rajasthan', 'uttar pradesh', 'madhya pradesh',
    'west bengal', 'punjab', 'haryana', 'bihar', 'jharkhand', 'odisha',
    'orissa', 'assam', 'goa', 'uttarakhand', 'himachal pradesh', 'chhattisgarh',
    'jammu and kashmir', 'ap', 'ts', 'tn', 'ka', 'mh', 'kl', 'dl'
];

const US_STATES = [
    'california', 'texas', 'florida', 'new york', 'pennsylvania', 'illinois',
    'ohio', 'georgia', 'north carolina', 'michigan', 'new jersey', 'virginia',
    'washington', 'arizona', 'massachusetts', 'tennessee', 'indiana', 'missouri',
    'maryland', 'wisconsin', 'colorado', 'minnesota', 'south carolina', 'alabama',
    'louisiana', 'kentucky', 'oregon', 'oklahoma', 'connecticut', 'utah',
    'ca', 'tx', 'fl', 'ny', 'pa', 'il', 'oh', 'ga', 'nc', 'mi', 'nj', 'va', 'wa',
    'az', 'ma', 'tn', 'in', 'mo', 'md', 'wi', 'co', 'mn', 'sc', 'al', 'la', 'ky',
    'or', 'ok', 'ct', 'ut'
];

const CITY_TO_COUNTRY = {
    // India
    'visakhapatnam': 'India', 'vizag': 'India', 'mumbai': 'India', 'delhi': 'India',
    'new delhi': 'India', 'bangalore': 'India', 'bengaluru': 'India', 'hyderabad': 'India',
    'chennai': 'India', 'kolkata': 'India', 'pune': 'India', 'ahmedabad': 'India',
    'jaipur': 'India', 'gurgaon': 'India', 'gurugram': 'India', 'noida': 'India',
    'chandigarh': 'India', 'kochi': 'India', 'cochin': 'India', 'trivandrum': 'India',
    'thiruvananthapuram': 'India', 'coimbatore': 'India', 'indore': 'India', 'bhopal': 'India',
    'lucknow': 'India', 'nagpur': 'India', 'surat': 'India', 'vadodara': 'India',
    'patna': 'India', 'bhubaneswar': 'India', 'guwahati': 'India', 'vijayawada': 'India',
    'guntur': 'India', 'tirupati': 'India', 'warangal': 'India', 'rajahmundry': 'India',
    'kakinada': 'India', 'nellore': 'India', 'kurnool': 'India', 'mangalore': 'India',
    'mangaluru': 'India', 'mysore': 'India', 'mysuru': 'India', 'calicut': 'India',
    'kozhikode': 'India', 'amravati': 'India', 'amaravati': 'India', 'nizamabad': 'India',

    // United States
    'san francisco': 'United States', 'new york': 'United States', 'nyc': 'United States',
    'los angeles': 'United States', 'chicago': 'United States', 'houston': 'United States',
    'seattle': 'United States', 'austin': 'United States', 'boston': 'United States',
    'san jose': 'United States', 'atlanta': 'United States', 'miami': 'United States',
    'dallas': 'United States', 'denver': 'United States', 'phoenix': 'United States',
    'philadelphia': 'United States', 'san diego': 'United States', 'portland': 'United States',
    'las vegas': 'United States', 'washington': 'United States', 'washington dc': 'United States',
    'detroit': 'United States', 'minneapolis': 'United States', 'tampa': 'United States',

    // United Kingdom
    'london': 'United Kingdom', 'manchester': 'United Kingdom', 'birmingham': 'United Kingdom',
    'edinburgh': 'United Kingdom', 'glasgow': 'United Kingdom', 'bristol': 'United Kingdom',
    'leeds': 'United Kingdom', 'liverpool': 'United Kingdom', 'oxford': 'United Kingdom',
    'cambridge': 'United Kingdom',

    // Canada
    'toronto': 'Canada', 'vancouver': 'Canada', 'montreal': 'Canada', 'calgary': 'Canada',
    'ottawa': 'Canada', 'edmonton': 'Canada', 'quebec': 'Canada', 'winnipeg': 'Canada',

    // Australia
    'sydney': 'Australia', 'melbourne': 'Australia', 'brisbane': 'Australia', 'perth': 'Australia',
    'adelaide': 'Australia', 'canberra': 'Australia',

    // UAE & Gulf
    'dubai': 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates', 'sharjah': 'United Arab Emirates',
    'doha': 'Qatar', 'riyadh': 'Saudi Arabia', 'jeddah': 'Saudi Arabia', 'muscat': 'Oman',
    'kuwait city': 'Kuwait', 'manama': 'Bahrain',

    // Europe
    'berlin': 'Germany', 'munich': 'Germany', 'frankfurt': 'Germany', 'hamburg': 'Germany',
    'paris': 'France', 'lyon': 'France', 'marseille': 'France', 'amsterdam': 'Netherlands',
    'rotterdam': 'Netherlands', 'brussels': 'Belgium', 'madrid': 'Spain', 'barcelona': 'Spain',
    'rome': 'Italy', 'milan': 'Italy', 'zurich': 'Switzerland', 'geneva': 'Switzerland',
    'vienna': 'Austria', 'stockholm': 'Sweden', 'oslo': 'Norway', 'copenhagen': 'Denmark',
    'helsinki': 'Finland', 'dublin': 'Ireland', 'warsaw': 'Poland', 'prague': 'Czech Republic',
    'budapest': 'Hungary', 'lisbon': 'Portugal',

    // Asia Pacific
    'singapore': 'Singapore', 'tokyo': 'Japan', 'osaka': 'Japan', 'kyoto': 'Japan',
    'seoul': 'South Korea', 'beijing': 'China', 'shanghai': 'China', 'shenzhen': 'China',
    'hong kong': 'Hong Kong', 'taipei': 'Taiwan', 'bangkok': 'Thailand', 'kuala lumpur': 'Malaysia',
    'jakarta': 'Indonesia', 'manila': 'Philippines', 'ho chi minh city': 'Vietnam', 'hanoi': 'Vietnam'
};

export function inferCountryFromCity(locationStr) {
    if (!locationStr || typeof locationStr !== 'string') return '';
    const cleanStr = locationStr.trim();
    if (!cleanStr) return '';

    // Split by comma
    const parts = cleanStr.split(',').map(p => p.trim()).filter(Boolean);

    // 1. Check last part if multi-token (e.g. "Visakhapatnam, Andhra Pradesh, India")
    if (parts.length > 1) {
        const lastPart = parts[parts.length - 1].toLowerCase();
        if (COUNTRY_ALIASES[lastPart]) {
            return COUNTRY_ALIASES[lastPart];
        }
    }

    // 2. Check first part or whole string in CITY_TO_COUNTRY dictionary
    const firstPart = parts[0].toLowerCase();
    if (CITY_TO_COUNTRY[firstPart]) {
        return CITY_TO_COUNTRY[firstPart];
    }
    const fullLower = cleanStr.toLowerCase();
    if (CITY_TO_COUNTRY[fullLower]) {
        return CITY_TO_COUNTRY[fullLower];
    }

    // 3. Search for any known country alias inside the string
    for (const [alias, countryName] of Object.entries(COUNTRY_ALIASES)) {
        if (alias.length > 2) {
            const regex = new RegExp(`\\b${alias}\\b`, 'i');
            if (regex.test(cleanStr)) {
                return countryName;
            }
        }
    }

    // 4. Check for state matches (e.g. "Visakhapatnam, AP" or "San Francisco, CA")
    if (parts.length > 1) {
        const stateToken = parts[1].toLowerCase();
        if (INDIAN_STATES.includes(stateToken)) return 'India';
        if (US_STATES.includes(stateToken)) return 'United States';
    }

    return '';
}
