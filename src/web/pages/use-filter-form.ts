import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EMPTY_FILTER_FORM, filterFormFrom, paramsFrom, type FilterForm } from './trip-list-state';

/** How long the search waits after the last key before the list is narrowed. */
const SEARCH_DELAY_MS = 300;

export interface FilterFormController {
  readonly form: FilterForm;
  /** What is in the search box right now, which runs ahead of `form.search` while the Traveler is still typing. */
  readonly searchText: string;
  readonly setSearchText: (text: string) => void;
  readonly change: (field: keyof FilterForm, value: string) => void;
  readonly clear: () => void;
}

/**
 * The search and filters of the Trips page. What the Traveler has typed is kept here and written to the address of
 * the page, not read back from it, so the router never decides what is in a box while it is being typed in: a space
 * at the end of a search is kept, and no key is lost. The address is followed only when something else changes it,
 * such as Back or a bookmark. Two changes made before the page has drawn the first both count, because each is made
 * to the latest form, not to the one last drawn.
 */
export function useFilterForm(): FilterFormController {
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<FilterForm>(() => filterFormFrom(params));
  const [searchText, setSearchText] = useState(form.search);
  const latest = useRef(form);
  /** Addresses this page has written and the router has not yet reported back, so they are not mistaken for outside changes. */
  const written = useRef(new Set<string>());

  const show = useCallback(
    (next: FilterForm) => {
      latest.current = next;
      setForm(next);
      const text = paramsFrom(next).toString();
      written.current.add(text);
      setParams(new URLSearchParams(text), { replace: true });
    },
    [setParams],
  );

  const change = useCallback((field: keyof FilterForm, value: string) => show({ ...latest.current, [field]: value }), [show]);

  const clear = useCallback(() => {
    setSearchText('');
    show(EMPTY_FILTER_FORM);
  }, [show]);

  useEffect(() => {
    if (searchText.trim() === latest.current.search.trim()) return undefined;
    const timer = setTimeout(() => change('search', searchText), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchText, change]);

  const address = params.toString();
  useEffect(() => {
    if (address === paramsFrom(latest.current).toString()) {
      written.current.clear();
      return;
    }
    if (written.current.delete(address)) return;
    const outside = filterFormFrom(new URLSearchParams(address));
    latest.current = outside;
    setForm(outside);
    setSearchText(outside.search);
  }, [address]);

  return { form, searchText, setSearchText, change, clear };
}
