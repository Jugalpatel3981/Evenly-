// Splitwise-style categories: [key, label, icon] grouped under a parent with its colour token.
export type Cat = {key: string; label: string; icon: string; parent: string; parentLabel: string; color: string};
export const CATEGORY_GROUPS: {key: string; label: string; color: string; items: [string, string, string][]}[] = [
  {key: 'entertainment', label: 'Entertainment', color: 'ent', items: [
    ['games', 'Games', 'gamepad-2'], ['movies', 'Movies', 'clapperboard'], ['music', 'Music', 'music'],
    ['sports', 'Sports', 'trophy'], ['ent_other', 'Entertainment, other', 'ticket']]},
  {key: 'food', label: 'Food and drink', color: 'food', items: [
    ['dining', 'Dining out', 'utensils'], ['groceries', 'Groceries', 'shopping-basket'], ['liquor', 'Liquor', 'wine'],
    ['food_other', 'Food and drink, other', 'coffee']]},
  {key: 'home', label: 'Home', color: 'home', items: [
    ['electronics', 'Electronics', 'monitor'], ['furniture', 'Furniture', 'sofa'], ['household', 'Household supplies', 'spray-can'],
    ['maintenance', 'Maintenance', 'wrench'], ['mortgage', 'Mortgage', 'landmark'], ['pets', 'Pets', 'paw-print'],
    ['rent', 'Rent', 'house'], ['services', 'Services', 'hand-helping'], ['home_other', 'Home, other', 'lamp']]},
  {key: 'life', label: 'Life', color: 'life', items: [
    ['childcare', 'Childcare', 'baby'], ['clothing', 'Clothing', 'shirt'], ['education', 'Education', 'graduation-cap'],
    ['gifts', 'Gifts', 'gift'], ['insurance', 'Insurance', 'shield-check'], ['medical', 'Medical expenses', 'stethoscope'],
    ['taxes', 'Taxes', 'receipt'], ['life_other', 'Life, other', 'heart']]},
  {key: 'transport', label: 'Transportation', color: 'transport', items: [
    ['bicycle', 'Bicycle', 'bike'], ['bus_train', 'Bus or train', 'tram-front'], ['car', 'Car', 'car'],
    ['fuel', 'Fuel', 'fuel'], ['hotel', 'Hotel', 'hotel'], ['parking', 'Parking', 'square-parking'],
    ['plane', 'Plane', 'plane'], ['taxi', 'Taxi', 'car-taxi-front'], ['transport_other', 'Transportation, other', 'route']]},
  {key: 'utilities', label: 'Utilities', color: 'utilities', items: [
    ['cleaning', 'Cleaning', 'sparkles'], ['electricity', 'Electricity', 'zap'], ['heat_gas', 'Heat or gas', 'flame'],
    ['trash', 'Trash', 'trash-2'], ['internet', 'TV, phone or internet', 'wifi'], ['water', 'Water', 'droplets'],
    ['utilities_other', 'Utilities, other', 'plug']]},
  {key: 'general', label: 'Uncategorised', color: 'general', items: [
    ['general', 'General', 'tag']]},
];

// Keys used by the first version of the app.
const OLD: Record<string, string> = {food: 'dining', travel: 'transport_other', stay: 'rent', bills: 'utilities_other', shopping: 'clothing', fun: 'ent_other', other: 'general'};

const BY_KEY: Record<string, Cat> = {};
for (const grp of CATEGORY_GROUPS) for (const [key, label, icon] of grp.items) BY_KEY[key] = {key, label, icon, parent: grp.key, parentLabel: grp.label, color: grp.color};

export const catOf = (k?: string | null): Cat => BY_KEY[k || ''] || BY_KEY[OLD[k || '']] || BY_KEY.general;

// Guess a category from a description, so typing "Uber" picks Taxi.
const HINTS: [RegExp, string][] = [
  [/uber|ola|lyft|taxi|cab|rapido/i, 'taxi'], [/rent/i, 'rent'], [/flight|plane|airline|indigo|vistara/i, 'plane'],
  [/hotel|airbnb|hostel|oyo|stay/i, 'hotel'], [/petrol|diesel|fuel|gas station/i, 'fuel'], [/train|metro|bus|irctc/i, 'bus_train'],
  [/grocer|blinkit|zepto|bigbasket|dmart|supermarket|vegetable/i, 'groceries'], [/beer|wine|bar|pub|liquor|alcohol/i, 'liquor'],
  [/dinner|lunch|breakfast|restaurant|swiggy|zomato|pizza|burger|food|cafe|coffee|chai|biryani/i, 'dining'],
  [/movie|cinema|pvr|inox|netflix|prime|hotstar/i, 'movies'], [/electric|power|bescom|light bill/i, 'electricity'],
  [/wifi|internet|broadband|jio|airtel|phone|mobile recharge/i, 'internet'], [/water/i, 'water'], [/gift|birthday/i, 'gifts'],
  [/doctor|medicine|pharmacy|hospital|medical/i, 'medical'], [/parking/i, 'parking'], [/clean|maid|laundry/i, 'cleaning'],
  [/game|playstation|steam/i, 'games'], [/concert|spotify|music/i, 'music'], [/gym|cricket|football|badminton|sport/i, 'sports'],
];
export const guessCategory = (desc: string): string | null => HINTS.find(([re]) => re.test(desc || ''))?.[1] || null;

export const GROUP_TYPES: [string, string, string][] = [['trip', 'Trip', 'plane'], ['home', 'Home', 'house'], ['couple', 'Couple', 'heart'], ['other', 'Other', 'users']];
export const typeOf = (t?: string | null) => GROUP_TYPES.find(x => x[0] === t) || GROUP_TYPES[3];
