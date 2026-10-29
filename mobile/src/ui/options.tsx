// Choices for the drop-down lists, and the short date label used in form toolbars.
import { CATEGORY_GROUPS } from '@/lib/categories';
import { ALL_CURRENCIES, currencyName, today } from '@/lib/util';

import type { Option } from './controls';
import { CatIcon } from './kit';

export const dayLabel = (d: string) => d === today() ? 'Today' : new Date(d + 'T00:00').toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
export const CATEGORY_OPTIONS: Option[] = CATEGORY_GROUPS.flatMap(g => g.items.map(([k, l]) => ({value: k, label: l, section: g.label, icon: <CatIcon cat={k} size={32} />})));
export const CURRENCY_OPTIONS: Option[] = ALL_CURRENCIES.map(c => ({value: c, label: `${c} · ${currencyName(c)}`}));
